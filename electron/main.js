/* ============================================================
   main.js — CMD-MUSIC 主进程
   职责：
     - 创建无边框透明渲染窗口（窗口态 / 壁纸态共用一个 BrowserWindow）
     - 壁纸模式：挂到桌面 WorkerW 背景层（wallpaper.js）+ 点击穿透 + 不占任务栏
     - 全局快捷键：媒体键 + Ctrl+Alt+W（切模式）+ Ctrl+Alt+C（控制面板）
     - 托盘菜单：播放/暂停/上下首/切模式/加音乐/退出
     - Ctrl+Alt+C 召唤控制面板（always-on-top 小窗，壁纸态下用它交互）
     - 文件对话框：选文件/选文件夹（递归扫描音频）
     - 主题与模式持久化（userData/settings.json）
   ============================================================ */
'use strict';

const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, dialog, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { enableWallpaper, disableWallpaper, probeWallpaper } = require('./wallpaper');
// 真实系统指标 / 音频文件头解析。顶层 require：两者都只依赖 node 内置模块，
// 在 app ready 之前加载是安全的（gpuStatus 内部自带 ready 兜底 + 缓存）。
const { sampleMetrics, gpuStatus } = require('./sysmetrics');
const { probeAudio } = require('./audioprobe');
// 本进程真实 GPU 占用率（Windows 性能计数器 \GPU Engine(*)\Utilization Percentage）。
// 与 gpuStatus() 分工：gpuStatus 回答「这台机器能不能硬件加速」（恒定环境状态），
// 本模块回答「本应用此刻吃多少 GPU」（动态值，与任务管理器同源同义）。
const gpuperf = require('./gpuperf');

// 控制台代码页本机是 GBK/936，而 Node 的 stdout 固定按 UTF-8 写字节，
// 于是 console.log 里的中文全变成乱码（已挂入桌面背景层 -> 宸查€€鍑哄绾告ā寮?）。
// 在任何输出之前把控制台切到 UTF-8。注意这只影响控制台显示，
// crashLog()/runWallpaperDiag() 落盘本来就是 UTF-8，不需要动。
// timeout 是必需的：execFileSync 默认无限等待会卡住主进程事件循环（本机实测 chcp/cmd
// 进程创建不稳定，3 次查询 2 次直接抛 EBUSY），所以下面的 catch 不是装饰，是必需的兜底。
try { require('child_process').execFileSync('chcp', ['65001'], { stdio: 'ignore', windowsHide: true, timeout: 2000 }); } catch { /* ignore */ }

// 启动崩溃真因已定位为「托盘图标 PNG 损坏 → new Tray() 失败并终止进程」，与 GPU/Dawn 无关
// （Dawn*Cache 的 ERROR 仅为非致命噪声），故不再强制软件渲染，保留默认 GPU 合成以保证频谱动画流畅。

// 原生崩溃（如 crashpad 报错）不会走 JS 异常，把进程级错误落盘以便排查
const CRASH_LOG = path.join(process.env.TEMP || process.env.LOCALAPPDATA || '.', 'cmdmusic_crash.log');
function crashLog(m) { try { fs.appendFileSync(CRASH_LOG, `[${new Date().toISOString()}] ${m}\n`); } catch { /* ignore */ } }
crashLog('--- main.js 启动 ---');
process.on('uncaughtException', (e) => crashLog('UNCAUGHT: ' + (e && e.stack || e)));
process.on('unhandledRejection', (e) => crashLog('REJECT: ' + (e && e.stack || e)));
app.on('render-process-gone', (_e, _wc, d) => crashLog('RENDER_GONE: ' + JSON.stringify(d)));
app.on('child-process-gone', (_e, d) => crashLog('CHILD_GONE: ' + JSON.stringify(d)));

let win = null;          // 主渲染窗口
let controlWin = null;   // Ctrl+Alt+C 控制面板
let dockWin = null;      // 壁纸态浮动控制条（不进 WorkerW，保持顶层窗口身份）
let settingsWin = null;  // 独立设置窗口（普通顶层窗口，不进 WorkerW）
let dockPollTimer = null;// 控制条显隐轮询定时器（壁纸窗口收不到 mousemove，只能轮询光标）
let dockHideTimer = null;// 移出后的隐藏防抖
let tray = null;
let mode = 'window';
let quitting = false;
let lastNowPlaying = null;   // 当前播放信息，供控制面板与控制条显示
let lastVolume = 1;          // 最近一次音量（0~1），由控制条滑块经 dock:command 上报
let windowBounds = null;     // 进入壁纸模式前记录窗口几何，退出时还原
let interactLock = false;    // 壁纸态交互锁（Ctrl+Alt+L）：true=整窗强制可交互

/* ---------- 设置持久化 ---------- */
// library：退出后保留的「音乐库」来源（文件夹递归扫描 + 显式添加的单曲）。
// 重启时主进程据此重新扫描、把曲目回填回渲染层，避免每次都要重新选文件夹。
function loadSettings() {
  const sp = path.join(app.getPath('userData'), 'settings.json');
  try {
    const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
    const def = { mode: 'window', theme: null, bounds: null, dockBounds: null, showDock: true, library: { folders: [], files: [] } };
    const merged = Object.assign(def, s);
    if (!merged.library || typeof merged.library !== 'object') merged.library = { folders: [], files: [] };
    merged.library.folders = Array.isArray(merged.library.folders) ? merged.library.folders : [];
    merged.library.files = Array.isArray(merged.library.files) ? merged.library.files : [];
    return merged;
  } catch {
    return { mode: 'window', theme: null, bounds: null, dockBounds: null, showDock: true, library: { folders: [], files: [] } };
  }
}
function saveSettings(s) {
  const sp = path.join(app.getPath('userData'), 'settings.json');
  try { fs.writeFileSync(sp, JSON.stringify(s)); } catch (e) { /* ignore */ }
}
let settings = { mode: 'window', theme: null, bounds: null, dockBounds: null, showDock: true, library: { folders: [], files: [] } };

/* ---------- 音频文件扫描 ---------- */
const AUDIO_RE = /\.(mp3|flac|wav|ogg|m4a|aac)$/i;
function walkDir(dir, out) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(p, out);
    else if (AUDIO_RE.test(e.name)) out.push(p);
  }
}

/* ---------- 主窗口 ---------- */
function createWindow() {
  const b = settings.bounds || { width: 1180, height: 760 };
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    frame: false,            // 无边框（用渲染层仿 cmd 标题栏）
    transparent: true,       // 透明，可透出桌面
    backgroundColor: '#00000000',
    resizable: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  crashLog('TRACE: BrowserWindow created');

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('did-fail-load', (_e, code, desc) => crashLog('did-fail-load ' + code + ' ' + desc));
  win.webContents.on('render-process-gone', (_e, d) => crashLog('render-gone ' + JSON.stringify(d)));

  win.on('close', (e) => {
    if (!quitting) { e.preventDefault(); win.hide(); } // 关闭 = 隐藏到托盘
  });
  win.on('closed', () => { win = null; });

  // 移动/缩放后记录几何，重启恢复
  const persistBounds = () => {
    if (mode === 'window' && win && !win.isDestroyed()) {
      settings.bounds = win.getBounds();
      saveSettings(settings);
    }
  };
  win.on('move', persistBounds);
  win.on('resize', persistBounds);

  win.webContents.on('did-finish-load', () => {
    if (settings.theme) win.webContents.send('apply-theme', settings.theme);
    setMode(settings.mode || 'window', false); // 重启恢复上次模式
    restoreLibrary();                          // 重启恢复音乐库（已添加的文件夹/单曲）
  });
}

/* ---------- 桌面层诊断 ----------
   沙箱/CI 环境没有桌面会话，WorkerW 相关逻辑无法在开发期验证。
   与其让用户手动跑 PowerShell 脚本再把输出粘回来，不如应用自己探测、自己落盘。
   失败时自动跑一次；托盘菜单里也有手动入口（Ctrl+Alt+D）。 */
const DIAG_FILE = path.join(process.env.TEMP || process.env.LOCALAPPDATA || '.', 'cmdmusic_wallpaper_diag.txt');
async function runWallpaperDiag() {
  const head = [
    'CMD-MUSIC 桌面壁纸层诊断报告',
    '时间: ' + new Date().toLocaleString(),
    '模式: ' + mode,
    'Electron: ' + process.versions.electron + '  Chrome: ' + process.versions.chrome,
    '窗口句柄: ' + (win && !win.isDestroyed() ? String(win.getNativeWindowHandle().readBigUInt64LE(0)) : '(none)'),
    '-' .repeat(56),
  ].join('\n');
  let body;
  try { body = await probeWallpaper(win); }
  catch (e) { body = 'FAIL 探测异常: ' + (e && e.message || e); }
  const rep = head + '\n' + body + '\n';
  try { fs.writeFileSync(DIAG_FILE, rep, 'utf8'); } catch (e) { crashLog('DIAG write fail: ' + e); }
  crashLog('DIAG\n' + rep);
  console.log('[diag]\n' + rep);
  return rep;
}

/* ---------- 模式切换 ---------- */
function setMode(m, persist = true) {
  mode = m;
  if (!win || win.isDestroyed()) return;
  if (m === 'wallpaper') {
    windowBounds = win.getBounds();
    // enableWallpaper 现在返回 {ok, reason}，失败时把【完整诊断报告】透给用户，
    // 不再让用户手动跑 PowerShell 脚本才能定位问题。
    enableWallpaper(win).then((res) => {
      const ok = !!(res && res.ok);
      crashLog('WALLPAPER_ENABLE ok=' + ok + ' detail=' + (res && (res.detail || res.reason) || ''));
      if (!win || win.isDestroyed()) return;
      if (ok) {
        win.webContents.send('log', '已挂入桌面背景层 → ' + (res.detail || ''));
        // Wallpaper Engine 之类占着同一个壁纸槽时，我们被压到它下面会「挂上了但看不见」。
        // 走 IPC 传字符串不受控制台编码影响，中文提示在这里是可靠的。
        if (res.wpe) {
          win.webContents.send('log',
            '检测到 Wallpaper Engine 正在占用壁纸层，请先完全退出它再切换，否则会互相遮挡（看不到播放器是正常现象，不是挂入失败）。');
        }
        return;
      }
      // 失败：立刻跑一次完整诊断，把报告写到文件 + 显示给用户
      runWallpaperDiag().then((rep) => {
        if (!win || win.isDestroyed()) return;
        win.webContents.send('log',
          '挂入桌面背景层失败（' + (res.reason || '未知') + '），已降级为常驻底部。' +
          '诊断报告已存到 ' + DIAG_FILE);
        win.webContents.send('diag-report', rep);
      }).catch((e) => { crashLog('WALLPAPER_DIAG throw ' + (e && e.message || e)); });
    }).catch((e) => {
      // enableWallpaper 理论上不抛（内部都 safe 包了），但如果 SetParent/JS 侧真抛了，
      // 没有这个 catch 就会变成一条无人处理的 unhandledrejection，用户只看到「没反应」。
      crashLog('WALLPAPER_ENABLE throw ' + (e && e.message || e));
      if (win && !win.isDestroyed()) {
        win.webContents.send('log',
          '挂入桌面背景层时发生异常：' + (e && e.message || e) + '。已保持普通窗口模式。');
      }
    });
  } else {
    // 必须等 disableWallpaper 完成再恢复几何：SetParent(NULL) 是异步的 PowerShell 过程，
    // 之前不 await 就直接 setBounds，窗口可能还是壁纸层子窗口，坐标会按父窗口客户区算而错位。
    // windowBounds 是模块级变量，回调里读到的就是执行这一刻的最新值——
    // 正好覆盖「等待期间用户又切了模式」的情况。
    disableWallpaper(win).then(() => {
      if (win && !win.isDestroyed() && windowBounds) win.setBounds(windowBounds);
    }).catch((e) => {
      crashLog('WALLPAPER_DISABLE error ' + (e && e.message || e));
    });
  }
  win.webContents.send('state', { mode: m });
  if (persist) { settings.mode = m; saveSettings(settings); }
  // 控制条只在壁纸态存在；切回窗口态必须收起来
  if (m === 'wallpaper') {
    if (settings.showDock === false) destroyDock();          // 用户在托盘里关掉了浮动控制条
    else if (!dockWin || dockWin.isDestroyed()) createDock();
  } else { hideDock(); }
  updateDockBounds();
  pushDockState();
  updateTray();
}

/* 托盘菜单里的「壁纸态显示浮动控制条」开关。
   关闭时直接 destroyDock（不是 hide）：否则控制条的窗口还在，
   光标轮询定时器也还在跑，纯粹是白烧资源；重开时按当前模式重新创建。 */
function setShowDock(on) {
  settings.showDock = !!on;
  saveSettings(settings);
  if (settings.showDock) {
    if (mode === 'wallpaper' && (!dockWin || dockWin.isDestroyed())) createDock();
  } else {
    destroyDock();
  }
  updateTray();
}

/* ---------- 交互锁（壁纸态兜底） ----------
   壁纸挂入 WorkerW 后有两种可能：
     A) 窗口成功下沉到图标层之下 → 桌面图标可点，但鼠标事件【到不了】我们的窗口，
        渲染层"命中控件才关穿透"的逻辑就永远等不到 mousemove，控件点不动。
     B) 窗口仍在桌面之上（SetParent 失败降级） → 靠渲染层动态穿透让图标可点。
   两种情况表现完全不同，且都无法从渲染层自我判断。
   所以提供一个人工开关 Ctrl+Alt+L：
     lock=true  → 强制不穿透（整窗可交互，用来滚动歌词/选歌单）
     lock=false → 交回渲染层动态穿透（默认，桌面图标可点） */
function setInteractLock(on) {
  interactLock = !!on;
  if (win && !win.isDestroyed()) win.webContents.send('interact-lock', interactLock);
  updateTray();
  crashLog('INTERACT_LOCK=' + interactLock);
}

/* ---------- 控制面板（Ctrl+Alt+C） ---------- */
function toggleControlPanel() {
  if (controlWin && !controlWin.isDestroyed()) {
    controlWin.close();
    controlWin = null;
    return;
  }
  controlWin = new BrowserWindow({
    width: 420, height: 300,
    frame: false, transparent: false,
    alwaysOnTop: true, skipTaskbar: true,
    resizable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  controlWin.loadFile(path.join(__dirname, 'renderer', 'control-panel.html'));
  controlWin.webContents.on('did-finish-load', () => {
    if (lastNowPlaying) controlWin.webContents.send('nowplaying', lastNowPlaying);
  });
  controlWin.on('closed', () => { controlWin = null; });
}

/* ---------- 独立设置窗口 ----------
   刻意【不】设 alwaysOnTop：它是普通顶层窗口，本来就在 WorkerW 桌面背景层之上，
   设了置顶反而会在用户切到别的全屏程序时赖在上面不走。
   也不设 skipTaskbar —— 这是设置窗口，用户要能 Alt+Tab 找得到它。 */
function openSettingsWin() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    try { if (settingsWin.isMinimized()) settingsWin.restore(); settingsWin.show(); settingsWin.focus(); } catch (e) { crashLog('SETTINGS focus fail ' + (e && e.message || e)); }
    if (settings.theme) settingsWin.webContents.send('apply-theme', settings.theme);
    return;
  }
  settingsWin = new BrowserWindow({
    width: 300, height: 470, minWidth: 260, minHeight: 380,
    frame: false, transparent: false, resizable: true, maximizable: false,
    backgroundColor: '#00005e',
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.webContents.on('did-fail-load', (_e, c, d) => crashLog('settings did-fail-load ' + c + ' ' + d));
  settingsWin.on('closed', () => { settingsWin = null; });
  settingsWin.webContents.on('did-finish-load', () => {
    if (settings.theme) settingsWin.webContents.send('apply-theme', settings.theme);
  });
}

/* ============================================================
   壁纸态控制条（dock）
   ------------------------------------------------------------
   为什么需要它：挂进 WorkerW 的窗口在这台机器上【永远收不到鼠标消息】。
   SysListView32（桌面图标列表）是 Progman 的子窗口，铺满全屏且 z 序在
   WorkerW 之上，192 点命中网格实测命中我方窗口 0 个，渲染层 mousemove
   连续 110 秒恒为 0。所以 app.js 那套动态穿透（HIT_SEL/PAD_IN/
   updatePenetration）在壁纸态永远不会被触发 —— 它只由 mousemove 驱动。
   setIgnoreMouseEvents 也救不了：它管不了「别的窗口挡在你上面」。
   结论（与 Wallpaper Engine 同一思路）：交互必须由一个【不进 WorkerW 的
   顶层置顶窗口】承担。这个窗口就是 dock。

   铁律：绝不对 dockWin 调用 enableWallpaper/disableWallpaper。
   一旦被挂进 WorkerW，它就失去鼠标消息，前功尽弃。
   ============================================================ */
const DOCK_W = 460, DOCK_H = 64;
const DOCK_HOT = 10;        // 光标命中判定外扩边距(px)
const DOCK_POLL_MS = 150;   // 光标轮询间隔
const DOCK_HIDE_DELAY = 400;// 移出后延迟隐藏，防掠过时闪烁

/* 把持久化的 dockBounds 校正回可见屏幕内。
   显示器被拔掉/分辨率变化后，存下来的坐标会落在屏幕外，窗口就找不到了。
   策略：优先用原坐标；完全不在任何屏幕内则回落到主显示器 workArea 居中。 */
function sanitizeDockBounds(b) {
  const fallback = () => {
    const wa = screen.getPrimaryDisplay().workArea;
    return { x: Math.round(wa.x + (wa.width - DOCK_W) / 2), y: Math.round(wa.y + wa.height - DOCK_H - 48), width: DOCK_W, height: DOCK_H };
  };
  if (!b || typeof b.x !== 'number' || typeof b.y !== 'number') return fallback();
  const cand = { x: Math.round(b.x), y: Math.round(b.y), width: DOCK_W, height: DOCK_H };
  // 与任一 display 的 workArea 有交集即视为可见
  for (const d of screen.getAllDisplays()) {
    const wa = d.workArea;
    const ix = Math.max(0, Math.min(cand.x + cand.width, wa.x + wa.width) - Math.max(cand.x, wa.x));
    const iy = Math.max(0, Math.min(cand.y + cand.height, wa.y + wa.height) - Math.max(cand.y, wa.y));
    if (ix > 0 && iy > 0) {
      // 有交集就夹紧到该 workArea 内，保证标题栏/拖动区完整可见
      cand.x = Math.min(Math.max(cand.x, wa.x), wa.x + wa.width - cand.width);
      cand.y = Math.min(Math.max(cand.y, wa.y), wa.y + wa.height - cand.height);
      return cand;
    }
  }
  return fallback();
}

function createDock() {
  if (dockWin && !dockWin.isDestroyed()) return dockWin;
  const b = sanitizeDockBounds(settings.dockBounds);
  dockWin = new BrowserWindow({
    x: b.x, y: b.y, width: DOCK_W, height: DOCK_H,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: 'screen',   // 必须高于 WorkerW，否则会输给壁纸层
    skipTaskbar: true,
    resizable: false, movable: true, minimizable: false, maximizable: false,
    focusable: false,        // 不抢焦点，避免打断用户正在输入的东西
    fullscreenable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // 显式再设一次：构造参数在部分 Windows 环境下不足以压过 WorkerW
  try {
    dockWin.setAlwaysOnTop(true, 'screen');
    dockWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (e) { crashLog('DOCK_TOPMOST fail ' + (e && e.message || e)); }

  dockWin.loadFile(path.join(__dirname, 'renderer', 'dockbar.html'));
  dockWin.webContents.on('did-fail-load', (_e, c, d) => crashLog('dock did-fail-load ' + c + ' ' + d));

  // 拖动后持久化位置
  dockWin.on('move', () => {
    if (!dockWin || dockWin.isDestroyed()) return;
    settings.dockBounds = dockWin.getBounds();
    saveSettings(settings);
  });
  dockWin.on('closed', () => { dockWin = null; });

  startDockPolling();
  pushDockState();
  return dockWin;
}

function destroyDock() {
  stopDockPolling();
  if (dockHideTimer) { clearTimeout(dockHideTimer); dockHideTimer = null; }
  if (dockWin && !dockWin.isDestroyed()) dockWin.close();
  dockWin = null;
}

/* showInactive 而非 show()：show() 会把焦点抢到 dock 上，
   用户正在别处输入时会打断他。dock 只需可见可点，不需要焦点。 */
function showDock() {
  if (!dockWin || dockWin.isDestroyed()) return;
  if (dockHideTimer) { clearTimeout(dockHideTimer); dockHideTimer = null; }
  if (!dockWin.isVisible()) { try { dockWin.showInactive(); } catch { /* ignore */ } }
}
function hideDock() {
  if (!dockWin || dockWin.isDestroyed()) return;
  if (dockHideTimer) { clearTimeout(dockHideTimer); dockHideTimer = null; }
  if (dockWin.isVisible()) { try { dockWin.hide(); } catch { /* ignore */ } }
}
/* 延迟隐藏：鼠标掠过控制条时不该闪一下就消失。
   回调里必须【重新判定】光标位置：定时器是在"还在范围内"时排的，
   400ms 内用户可能一直没动鼠标（甚至又移回来），无条件隐藏会让控制条
   在光标还停着的时候凭空消失。 */
function hideDockSoon() {
  if (!dockWin || dockWin.isDestroyed()) return;
  if (dockHideTimer) return;
  dockHideTimer = setTimeout(() => {
    dockHideTimer = null;
    if (!dockWin || dockWin.isDestroyed()) return;
    if (mode !== 'wallpaper') { hideDock(); return; }
    if (dockCursorInRange()) { showDock(); return; }   // 期间又移回来了 → 保持显示
    if (dockWin.isVisible()) { try { dockWin.hide(); } catch { /* ignore */ } }
  }, DOCK_HIDE_DELAY);
}

/* 壁纸窗口收不到 mousemove，所以显隐只能轮询光标位置 */
function dockCursorInRange() {
  if (!dockWin || dockWin.isDestroyed()) return false;
  const p = screen.getCursorScreenPoint();
  const b = dockWin.getBounds();
  return p.x >= b.x - DOCK_HOT && p.x <= b.x + b.width + DOCK_HOT
      && p.y >= b.y - DOCK_HOT && p.y <= b.y + b.height + DOCK_HOT;
}
function startDockPolling() {
  stopDockPolling();
  dockPollTimer = setInterval(() => {
    if (!dockWin || dockWin.isDestroyed()) { stopDockPolling(); return; }
    if (mode !== 'wallpaper') { hideDock(); return; }   // 窗口模式下不显示
    if (dockCursorInRange()) { showDock(); hideDockSoon(); }
    else if (!dockHideTimer) { hideDock(); }
  }, DOCK_POLL_MS);
}
function stopDockPolling() {
  if (dockPollTimer) { clearInterval(dockPollTimer); dockPollTimer = null; }
  if (dockHideTimer) { clearTimeout(dockHideTimer); dockHideTimer = null; }
}

/* 显隐受 mode / 可见性影响时重新求值（如切模式、dock 刚创建） */
function updateDockBounds() {
  if (mode !== 'wallpaper') { hideDock(); return; }
  if (!dockWin || dockWin.isDestroyed()) return;
  if (dockCursorInRange()) { showDock(); hideDockSoon(); }
}

/* 组装并推送控制条状态。数据全部来自现成通道，不另造状态机制。 */
function pushDockState() {
  if (!dockWin || dockWin.isDestroyed()) return;
  const np = lastNowPlaying || {};
  dockWin.webContents.send('dock-state', {
    playing: np.state === 'PLAYING',
    title: np.name || '(none)',
    artist: np.artist || '',
    volume: (typeof lastVolume === 'number') ? lastVolume : 1,
    mode,
  });
}

/* ---------- 托盘 ---------- */
function updateTray() {
  if (!tray) return;
  const tpl = [
    { label: mode === 'wallpaper' ? '◧ 壁纸模式' : '◻ 窗口模式', click: () => setMode(mode === 'wallpaper' ? 'window' : 'wallpaper') },
    { type: 'separator' },
    { label: interactLock ? '🔒 交互锁定：开（点击切换）' : '🔓 交互锁定：关（点击切换）', click: () => setInteractLock(!interactLock) },
    { label: '▶ 播放 / 暂停', click: () => forwardToRenderer('togglePlay') },
    { label: '⏭ 下一首', click: () => forwardToRenderer('next') },
    { label: '⏮ 上一首', click: () => forwardToRenderer('prev') },
    { type: 'separator' },
    { label: '＋ 添加文件', click: () => openFilesDialog() },
    { label: '＋ 添加文件夹', click: () => openFolderDialog() },
    { label: '🗑 清空音乐库', click: () => clearLibrary() },
    { label: '⚙ 设置…', click: () => openSettingsWin() },
    { type: 'checkbox', label: '壁纸态显示浮动控制条', checked: settings.showDock !== false,
      click: (mi) => setShowDock(mi.checked) },
    { label: '⚙ 控制面板 (Ctrl+Alt+C)', click: () => toggleControlPanel() },
    { type: 'separator' },
    { label: '🔍 桌面层诊断 (Ctrl+Alt+D)', click: () => runWallpaperDiag().then((rep) => {
      if (win && !win.isDestroyed()) { win.show(); win.webContents.send('diag-report', rep); }
    }) },
    { label: '退出', click: () => { quitting = true; app.quit(); } },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(tpl));
}

/* ---------- 托盘图标：运行时生成合法 PNG ---------- */
// 之前用硬编码 base64 PNG 做托盘图标，但那份数据损坏（IDAT 不完整），
// Electron 解码失败 → new Tray() 抛错；兜底 new Tray(空 Buffer) 又抛一次，
// 抛在 whenReady 回调里无人接 → 未捕获 rejection 终止进程（表现为启动即崩）。
// 这里改为用 zlib 现场编码一张保证合法的 32x32 PNG（CMD 蓝底 + 白色 ">_"），
// 并让 createTray 失败时只跳过托盘、绝不抛出，杜绝再次崩溃。
function _crc32(buf) {
  const t = []; let n, c;
  for (n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function _pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(_crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function makeTrayIconPng(size = 32) {
  const m = 2, rad = Math.max(3, Math.floor(size * 0.16));
  const px = (x, y) => {
    if (x < m || x >= size - m || y < m || y >= size - m) return [0, 0, 0, 0];
    const cx = x < m + rad ? m + rad : (x >= size - m - rad ? size - m - rad - 1 : x);
    const cy = y < m + rad ? m + rad : (y >= size - m - rad ? size - m - rad - 1 : y);
    if ((x - cx) ** 2 + (y - cy) ** 2 > rad * rad) return [0, 0, 0, 0];
    if (x === m || x === size - m - 1 || y === m || y === size - m - 1) return [255, 255, 255, 255];
    const S = size, u = S / 32; // 以 32px 为基准缩放
    const seg = (ax, ay, bx, by, t) => { const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; let tt = ((x - ax) * dx + (y - ay) * dy) / L2; tt = Math.max(0, Math.min(1, tt)); const qx = ax + dx * tt, qy = ay + dy * tt; return (x - qx) ** 2 + (y - qy) ** 2 <= t * t; };
    const tw = Math.max(1.1, 1.4 * u);
    if (seg(11 * u, 11 * u, 17 * u, 16 * u, tw) || seg(17 * u, 16 * u, 11 * u, 21 * u, tw)) return [255, 255, 255, 255];
    if (seg(19 * u, 21 * u, 24 * u, 21 * u, tw * 0.85)) return [255, 255, 255, 255];
    return [0, 0, 170, 255];
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (1 + size * 4)); let o = 0;
  for (let y = 0; y < size; y++) { raw[o++] = 0; for (let x = 0; x < size; x++) { const c = px(x, y); raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2]; raw[o++] = c[3]; } }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), _pngChunk('IHDR', ihdr), _pngChunk('IDAT', zlib.deflateSync(raw)), _pngChunk('IEND', Buffer.alloc(0))]);
}

function createTray() {
  const iconPath = path.join(app.getPath('temp'), 'cmdmusic_tray.png');
  try { fs.writeFileSync(iconPath, makeTrayIconPng(32)); } catch (e) { crashLog('TRAY icon write fail: ' + e); }
  try {
    tray = new Tray(iconPath);
  } catch (e) {
    // 托盘创建失败不应影响主功能：退化为 nativeImage，再不行就跳过托盘
    crashLog('TRAY new Tray(path) fail: ' + (e && e.message || e));
    try { const { nativeImage } = require('electron'); tray = new Tray(nativeImage.createFromBuffer(makeTrayIconPng(32))); }
    catch (e2) { crashLog('TRAY skip (no tray): ' + (e2 && e2.message || e2)); tray = null; return; }
  }
  try {
    tray.setToolTip('CMD-MUSIC');
    tray.on('click', () => { if (win && !win.isDestroyed()) win.show(); });
    updateTray();
  } catch (e) { crashLog('TRAY setup fail: ' + (e && e.message || e)); }
}

/* ---------- 向渲染层转发控制 ---------- */
function forwardToRenderer(action) {
  if (win && !win.isDestroyed()) win.webContents.send('control', action);
}

/* ---------- 文件对话框 ---------- */
function openFilesDialog() {
  if (!win) return;
  dialog.showOpenDialog(win, {
    title: '选择音乐文件',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '音频', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac'] }],
  }).then(({ canceled, filePaths }) => {
    if (canceled || !filePaths.length) return;
    // 持久化到音乐库：重启后这些单曲会被重新加入（不存在的文件会被跳过）
    const lib = settings.library;
    let changed = false;
    for (const f of filePaths) {
      if (!lib.files.includes(f)) { lib.files.push(f); changed = true; }
    }
    if (changed) saveSettings(settings);
    addPaths(filePaths);
  });
}
function openFolderDialog() {
  if (!win) return;
  dialog.showOpenDialog(win, {
    title: '选择音乐文件夹（递归扫描）',
    properties: ['openDirectory'],
  }).then(({ canceled, filePaths }) => {
    if (canceled || !filePaths.length) return;
    const dir = filePaths[0];
    // 持久化到音乐库：仅存文件夹路径，重启后重新递归扫描（自动反映增删的曲目）
    if (!settings.library.folders.includes(dir)) {
      settings.library.folders.push(dir);
      saveSettings(settings);
    }
    const out = [];
    walkDir(dir, out);
    if (out.length) addPaths(out);
    else if (win && !win.isDestroyed()) win.webContents.send('log', 'ERR: 文件夹内未发现音频文件');
  });
}
function addPaths(paths) {
  if (win && !win.isDestroyed()) win.webContents.send('add-paths', paths);
}

/* ---------- 音乐库持久化：重启恢复 / 清空 ---------- */
let libraryRestored = false;
// 启动后按已保存的 library 重新扫描并回填播放列表（只跑一次，dev 热重载也不重复）
function restoreLibrary() {
  if (libraryRestored) return;
  libraryRestored = true;
  if (!win || win.isDestroyed()) return;
  const lib = settings.library || { folders: [], files: [] };
  const seen = new Set();
  const out = [];
  for (const f of (lib.folders || [])) {
    const found = [];
    walkDir(f, found);
    for (const p of found) { if (!seen.has(p)) { seen.add(p); out.push(p); } }
  }
  for (const f of (lib.files || [])) {
    if (AUDIO_RE.test(f) && !seen.has(f)) { seen.add(f); out.push(f); }
  }
  if (out.length) win.webContents.send('add-paths', out);
}
// 清空音乐库（托盘菜单 / 渲染层 `clear library` 命令共用）：丢弃来源 + 通知渲染层清列表
function clearLibrary() {
  settings.library = { folders: [], files: [] };
  saveSettings(settings);
  if (win && !win.isDestroyed()) win.webContents.send('clear-library');
}

/* ---------- IPC ---------- */
function registerIpc() {
  // 渲染层请求切换模式
  ipcMain.on('toggle-mode', () => setMode(mode === 'wallpaper' ? 'window' : 'wallpaper'));
  // 壁纸态动态点击穿透：由渲染层按鼠标是否在播放器内实时控制
  ipcMain.on('set-ignore-mouse', (_e, on) => {
    if (win && !win.isDestroyed()) { try { win.setIgnoreMouseEvents(!!on, { forward: true }); } catch { /* ignore */ } }
  });
  // 标题栏按钮
  ipcMain.on('win:min', () => win && win.minimize());
  ipcMain.on('win:max', () => { if (win && win.isMaximized()) win.unmaximize(); else win && win.maximize(); });
  ipcMain.on('win:close', () => win && win.hide());
  // 文件对话框（渲染层 / 控制面板触发）
  ipcMain.handle('open-files', () => { openFilesDialog(); return []; });
  ipcMain.handle('open-folder', () => { openFolderDialog(); return []; });
  // 主题持久化。广播给所有窗口，任何一处改主题其它窗口控件立刻同步
  // （设置窗口回填控件靠的就是这条 apply-theme）。
  // 注意：主窗口 applyTheme 会 saveTheme 再触发本条，形成回环，由渲染层防重入守卫兜住。
  ipcMain.on('save-theme', (_e, t) => {
    settings.theme = t; saveSettings(settings);
    if (win && !win.isDestroyed()) win.webContents.send('apply-theme', t);
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('apply-theme', t);
  });
  // 独立设置窗口：索要当前主题 / 关闭自身
  ipcMain.on('settings:request-theme', () => {
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('apply-theme', settings.theme || null);
  });
  ipcMain.on('settings:close', () => { if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close(); });
  ipcMain.on('log', (_e, m) => { if (win && !win.isDestroyed()) win.webContents.send('log', m); });
  // 控制面板 → 主窗口
  ipcMain.on('control:open-files', () => openFilesDialog());
  ipcMain.on('control:open-folder', () => openFolderDialog());
  // 渲染层 `clear library` 命令 → 清空持久化音乐库并通知渲染层清列表
  ipcMain.on('clear-library', () => clearLibrary());
  ipcMain.on('control:command', (_e, text) => { if (win && !win.isDestroyed()) win.webContents.send('run-command', text); });
  ipcMain.on('control:toggle-mode', () => setMode(mode === 'wallpaper' ? 'window' : 'wallpaper'));
  // 渲染层上报当前播放 → 控制面板
  ipcMain.on('nowplaying', (_e, info) => {
    lastNowPlaying = info;
    if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('nowplaying', info);
    // 复用同一份播放信息同步给控制条，不另造一套状态机制
    if (typeof info.volume === 'number') lastVolume = info.volume;
    pushDockState();
  });

  // 控制条命令
  ipcMain.on('dock:command', (_e, action) => {
    if (typeof action !== 'string') return;
    if (action === 'toggleMode') { setMode(mode === 'wallpaper' ? 'window' : 'wallpaper'); return; }
    if (action === 'settings') { openSettingsWin(); return; }
    if (action.indexOf('volume:') === 0) {
      const n = parseFloat(action.slice(7));
      if (isFinite(n)) {
        lastVolume = Math.min(1, Math.max(0, n));
        pushDockState();
      }
      forwardToRenderer(action);   // 交给渲染层真正作用到 audio.volume
      return;
    }
    // 'prev' | 'togglePlay' | 'next' 复用现成的 control 通道
    if (action === 'prev' || action === 'togglePlay' || action === 'next') forwardToRenderer(action);
  });

  /* ---- 真实系统指标（非模拟）----
   * 采样节奏由渲染层控制（setInterval 1000ms），主进程不再叠定时器：
   * sampleMetrics 是「两次采样求差值」，间隔必须 >=500ms 才有意义，
   * 而且渲染层原来每帧（~165 次/秒）调 simStats，纯属浪费。 */
  ipcMain.handle('sys-metrics', () => {
    try {
      // 不传 firstCall：首次调用即 warmup，cpuPct 会是 0 且 warmup:true，
      // 渲染层据此显示 '--' 而不是 0（0 会被误读成"CPU 真的是 0"）。
      return { ok: true, m: sampleMetrics(), g: gpuStatus(), p: gpuperf.getGpuPerf() };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  });

  /* ---- 音频文件头解析（非 ffprobe，自己逐位解析容器头）---- */
  ipcMain.handle('probe-audio', (_e, filePath) => {
    if (typeof filePath !== 'string' || !filePath) return { ok: false, error: 'invalid path' };
    try {
      return probeAudio(filePath);
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  });
}

/* ---------- 全局快捷键 ---------- */
function registerShortcuts() {
  // 安全媒体键（不会劫持 Space/N/P 影响其他软件）
  globalShortcut.register('MediaPlayPause', () => forwardToRenderer('togglePlay'));
  globalShortcut.register('MediaNextTrack', () => forwardToRenderer('next'));
  globalShortcut.register('MediaPreviousTrack', () => forwardToRenderer('prev'));
  // 模式切换
  globalShortcut.register('Ctrl+Alt+W', () => setMode(mode === 'wallpaper' ? 'window' : 'wallpaper'));
  // 交互锁：壁纸态下强制整窗可交互 / 交回动态穿透
  globalShortcut.register('Ctrl+Alt+L', () => setInteractLock(!interactLock));
  // 召唤控制面板
  globalShortcut.register('Ctrl+Alt+C', () => toggleControlPanel());
  // 桌面层诊断（把壁纸挂载排查报告写到 %TEMP%\cmdmusic_wallpaper_diag.txt）
  globalShortcut.register('Ctrl+Alt+D', () => runWallpaperDiag());
}

/* ---------- 启动 ---------- */
app.whenReady().then(() => {
  settings = loadSettings();
  // 预热 GPU 状态：getGPUFeatureStatus 必须在 app ready 之后才可用，
  // 提前拿到并缓存，后续 sys-metrics 直接命中缓存。
  try { gpuStatus(); } catch { /* ignore */ }
  createWindow();
  createTray();
  registerIpc();
  registerShortcuts();
  /* 启动 GPU 占用率后台采样。
   * 3 秒一次是实测权衡的结果：本机单次 Get-Counter 要 300~3500ms
   * （起一个 powershell.exe 子进程 + 读 647 个实例），再密就是纯浪费。
   * 采样在后台跑，渲染层读的是同步缓存，不会被这个耗时卡住 UI。
   * setAppPids 必须给：Electron 是多进程的，真正产生 GPU 负载的
   * 是渲染进程/GPU 进程，只认 process.pid（主进程）永远读到 0。 */
  try {
    gpuperf.setAppPids(app.getAppMetrics().map(m => m.pid));
    gpuperf.startGpuPerf(3000);
  } catch (e) {
    crashLog('GPUPERF_START_FAIL: ' + ((e && e.message) || e));
  }
  crashLog('APP_READY mode=' + (settings.mode || 'window'));

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

/* 进程列表会变（渲染/GPU 进程可能重启），定时刷新 pid 集合，
   否则新建的窗口产生的 GPU 负载会统计不到。 */
setInterval(() => {
  try { gpuperf.setAppPids(app.getAppMetrics().map(m => m.pid)); } catch { /* ignore */ }
}, 10000).unref();

app.on('window-all-closed', () => { /* 保留托盘，不退出 */ });
app.on('before-quit', () => { quitting = true; stopDockPolling(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); stopDockPolling(); destroyDock(); try { gpuperf.stopGpuPerf(); } catch { /* ignore */ } if (settingsWin && !settingsWin.isDestroyed()) settingsWin.destroy(); });
