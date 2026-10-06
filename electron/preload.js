/* ============================================================
   preload.js — 渲染层与主进程的安全桥（contextIsolation 开启）
   渲染层通过 window.api 暴露的方法与主进程通信，不直接 require electron。
   ============================================================ */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /* ---- 主进程 → 渲染层 ---- */
  // 模式/状态变化（{ mode: 'window' | 'wallpaper' }）
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  // 应用持久化的主题
  onApplyTheme: (cb) => ipcRenderer.on('apply-theme', (_e, t) => cb(t)),
  // 主进程（控制面板/托盘）要求添加本地文件
  onAddPaths: (cb) => ipcRenderer.on('add-paths', (_e, paths) => cb(paths)),
  // 主进程（控制面板）转发的命令文本
  onRunCommand: (cb) => ipcRenderer.on('run-command', (_e, text) => cb(text)),
  // 主进程转发到渲染层的控制动作（媒体键 / 托盘菜单）：'togglePlay' | 'next' | 'prev'
  onControl: (cb) => ipcRenderer.on('control', (_e, action) => cb(action)),
  // 桌面层诊断报告（壁纸挂入失败时主进程自动发出，或 Ctrl+Alt+D 手动触发）
  onDiagReport: (cb) => ipcRenderer.on('diag-report', (_e, rep) => cb(rep)),
  // 主进程日志（如文件夹无音频文件等提示）
  onLog: (cb) => ipcRenderer.on('log', (_e, msg) => cb(msg)),
  // 主进程清空音乐库后通知渲染层清空播放列表
  onClearLibrary: (cb) => ipcRenderer.on('clear-library', (_e) => cb()),
  // 交互锁状态变化（Ctrl+Alt+L / 托盘菜单）：true=整窗强制可交互，不做动态穿透
  onInteractLock: (cb) => ipcRenderer.on('interact-lock', (_e, on) => cb(!!on)),
  // 主进程 → 控制条：{ playing, title, artist, volume, mode }
  onDockState: (cb) => ipcRenderer.on('dock-state', (_e, s) => cb(s)),

  /* ---- 渲染层 → 主进程 ---- */
  toggleMode: () => ipcRenderer.send('toggle-mode'),
  setIgnoreMouse: (on) => ipcRenderer.send('set-ignore-mouse', on),
  winMin: () => ipcRenderer.send('win:min'),
  winMax: () => ipcRenderer.send('win:max'),
  winClose: () => ipcRenderer.send('win:close'),
  openFiles: () => ipcRenderer.invoke('open-files'),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  saveTheme: (t) => ipcRenderer.send('save-theme', t),
  log: (m) => ipcRenderer.send('log', m),
  // 渲染层请求主进程清空音乐库（托盘菜单会直接在主进程侧清，这条供命令行用）
  clearLibrary: () => ipcRenderer.send('clear-library'),
  // 控制面板专用：转发命令文本 / 上报当前播放
  sendCommand: (text) => ipcRenderer.send('control:command', text),
  nowPlaying: (info) => ipcRenderer.send('nowplaying', info),
  onNowPlaying: (cb) => ipcRenderer.on('nowplaying', (_e, info) => cb(info)),

  /* ---- 壁纸态控制条专用 ---- */
  // 控制条发命令：'prev' | 'togglePlay' | 'next' | 'settings' | 'toggleMode' | 'volume:<0~1>'
  // 注意：onDockState 已在上方"主进程 → 渲染层"区块定义（preload.js:26），此处不再重复定义。
  dockCommand: (action) => ipcRenderer.send('dock:command', action),

  /* ---- 独立设置窗口专用 ---- */
  // 向主进程索要当前主题（主进程用 apply-theme 回给本窗口）
  requestTheme: () => ipcRenderer.send('settings:request-theme'),
  closeSettings: () => ipcRenderer.send('settings:close'),

  /* ---- 真实系统指标 / 音频文件头（非模拟、非 ffprobe）---- */
  // 采样节奏由渲染层控制（1s 一次）。sampleMetrics 是差值采样，
  // 间隔必须 >=500ms；首次调用为 warmup，m.warmup===true 时 m.cpuPct 无意义。
  // 返回 { ok, m:{cpuPct,ramPct,rssMB,heapMB,ramTotalGB,cores,ts,warmup},
  //       g:{gpu:'HW'|'SW'|'OFF'|'UNKNOWN', gpuDetail} }
  sysMetrics: () => ipcRenderer.invoke('sys-metrics'),
  // 主进程逐位解析音频文件头（WAV/MP3/FLAC/OGG/M4A）。
  // 注意：bitDepth 对 MP3/Vorbis/Opus/AAC 恒为 null —— 有损格式里没这个概念，
  // 渲染层必须显示 '--'，不许用 16 之类的默认值填坑。
  probeAudio: (p) => ipcRenderer.invoke('probe-audio', p),
});
