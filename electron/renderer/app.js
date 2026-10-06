/* ============================================================
   CMD-MUSIC — 渲染层 app.js（Electron 版）
   与 Demo 的差异：
     - 通过 window.api（preload/contextBridge）与主进程通信：模式切换、标题栏按钮、
       文件对话框（选文件/选文件夹，主进程递归扫描后回传真实路径）、
       主题持久化、媒体键/托盘转发的控制动作。
     - 本地音频用 file:// 真实路径播放（不再是 object URL 模拟）。
     - 壁纸模式下整窗点击穿透，交互走"控制面板(Ctrl+Alt+C)/托盘/媒体键"。
   ============================================================ */
'use strict';

// 注意：preload 通过 contextBridge 注入的全局名是 `api`。
// 这里局部常量必须取别的名字——若也声明为 `const api`，会与全局 `api` 撞名，
// 报 "Identifier 'api' has already been declared"，导致整个脚本不执行（窗口空壳）。
const bridge = window.api;
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const audio = new Audio();   // 不跨域，本地 file:// 可直接播放

const specCanvas = $('specCanvas');
const waveCanvas = $('waveCanvas');
const sctx = specCanvas.getContext('2d');
const wctx = waveCanvas.getContext('2d');

/* ---------- 状态 ---------- */
const state = {
  tracks: [],
  cur: -1,
  playing: false,
  loop: true,
  shuffle: false,
  mode: 'window',
  interactLock: false,   // 壁纸态交互锁（Ctrl+Alt+L）
  _ignore: null,         // 当前是否已开启穿透（去重用）
  volume: 1,             // 音量 0~1（此前无音量概念，壁纸态控制条滑块需要它）
  audioCtx: null, analyser: null, srcNode: null,
};

/* ---------- 主题系统（整屏跟随 + 持久化） ---------- */
const root = document.documentElement;
let currentTheme = null;   // 由下方 applyTheme(PRESETS.classic) 初始化

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/* 派生色阶：面板 / 凹槽 / 凸起。
   关键修复：此前 .panel / .wavebox / .meter / .prog / 按钮全部写
   rgba(var(--cmd-bg-rgb), 0.55~0.8)，而屏幕底色本身就是同一个 bg 且 alpha=1，
   同色叠同色 = 算出完全相同的颜色 → 面板与屏幕糊成一片，"配色看起来不对"。

   方向要自适应：常规亮底（如 classic #0000aa）往黑压出凹陷感；
   极暗底（black/green/amber 本身就很深）再往黑压等于没压（色差 <30，肉眼无层次），
   必须反向往白提，才能看出框中框。
   判据用【最大通道值】而不是 luma：classic 蓝 luma=0.048、black 也是 0.048，
   luma 分不开；但峰值通道 170 vs 16 一目了然。阈值 64 把 5 个预设全部分对。 */
function peak(rgb) { return Math.max(rgb[0], rgb[1], rgb[2]); }
function mix(rgb, target, t) {
  return rgb.map((v, i) => Math.round(v + (target[i] - v) * t)).join(', ');
}
function setBgVars(rgb) {
  root.style.setProperty('--cmd-bg-rgb', rgb.join(', '));
  const dark = peak(rgb) < 64;                   // 极暗底往白提，其余往黑压
  root.style.setProperty('--cmd-panel-rgb', dark ? mix(rgb, [255, 255, 255], 0.11) : mix(rgb, [0, 0, 0], 0.45));
  root.style.setProperty('--cmd-sunken-rgb', dark ? mix(rgb, [255, 255, 255], 0.05) : mix(rgb, [0, 0, 0], 0.72));
  root.style.setProperty('--cmd-chip-rgb', dark ? mix(rgb, [255, 255, 255], 0.24) : mix(rgb, [255, 255, 255], 0.18));
  return dark;
}

/* 把主题里的颜色/高亮色同步成 rgba() 可用的 "r, g, b" 三元组。
   为什么需要：CSS 里凡是写成 var(--cmd-accent)（十六进制实色）的元素，
   alpha 滑块永远作用不到——它们是独立的不透明源。
   探针 probe_alpha_grid.js 在 alpha=0.3 时实测到 19/384 个采样点 a>=250，
   分布在 div.progress(16) / #npTitle(2) / #npDot(1) 上，那些全是实色。 */
function setColorVars(t) {
  const put = (name, hex, fallback) => {
    if (typeof hex !== 'string' || !/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return;
    const c = hexToRgb(hex);
    root.style.setProperty(name, c.join(', '));
    void fallback;
  };
  put('--cmd-dim-rgb', t.dim, '#9a9ad6');
  put('--cmd-accent-rgb', t.accent, '#66ccff');
  put('--cmd-bright-rgb', t.fg, '#e8e8e8');
  put('--cmd-green-rgb', t.green, '#33ff66');
}

/* ---------- 透明度反解（本次修复的核心）----------
   半透明是【逐层叠乘】的：n 层各带 alpha a，合成不透明度 = 1-(1-a)^n。
   以前每一层都直接吃滑块值 T，于是窗口态三层
   （.stage → .screen → .panel）合成 1-(1-T)³：
     T=0.3 → 0.648   T=0.5 → 0.875   T=0.2 → 0.488
   也就是说中段拖滑块几乎没反应，只有拖到接近 0 才突然变透明——
   这正是用户反馈"窗口模式依然无法很好的透视"的成因
   （探针实测 alpha=0.3 时 244/384 个采样点落在 a≈160，即 63%）。

   反解：要让 n 层叠乘后恰好等于目标 T，每层取 a = 1-(1-T)^(1/n)。

   n 的取法（关键：两种模式的背景层数不同，绝不能共用一个 n）：
     - 窗口态 n=3：.stage + .screen + .panel。panel 覆盖屏幕绝大部分面积，
       所以让 3 层区域精确命中 T，视觉上"拖到几就是几"。
       层数更少的区域（.stage 外圈 2px、.titlebar 两层）会比 T 更透，
       这是安全的方向（宁可多透，不要挡住桌面）。
       层数更多的区域（.wavebox / .prog / .meter 这些井内嵌套，第 4 层）
       会比 T 略密——刻意保留，它们是凹陷井，本来就该比板面实一点。
     - 壁纸态 n=2：.stage.wallpaper 是 background:transparent（styles.css），
       .stage 那一层整个消失，但【.panel 并没有消失】——面板还在，
       只是铺满全屏。所以壁纸态是 .screen + .panel 两层，不是一层！
       ⚠ 这里若按 n=1 反解，panel 区会叠成 1-(1-T)²，滑块 0.3 实际 51%，
       比窗口态还更不透明，完全反了。这是实测出来的，不是推测：
       probe_alpha_layers.js 在两种模式下分别统计了整屏层数直方图。
   两个 n 都由 probe_alpha_layers.js 的"众数 == 假设 n"断言守着。 */
const PANEL_LAYERS_WINDOW = 3;      // .stage + .screen + .panel
const PANEL_LAYERS_WALLPAPER = 2;   // .screen + .panel（.stage 透明）
function applyAlpha(t) {
  const T = Math.min(1, Math.max(0, Number(t)));
  const n = (state.mode === 'wallpaper') ? PANEL_LAYERS_WALLPAPER : PANEL_LAYERS_WINDOW;
  // T=0 时 Math.pow(1, 1/n)=1 → a=0；T=1 时 0^(1/n)=0 → a=1。两端都正确。
  const a = 1 - Math.pow(1 - T, 1 / n);
  root.style.setProperty('--cmd-bg-alpha', T);          // 保留原始目标值，供探针/其它逻辑读
  root.style.setProperty('--cmd-layer-alpha', a.toFixed(4));
}

function applyTheme(t, opts) {
  const silent = opts && opts.silent;   // silent=true 时不回调 saveTheme（见下方回环说明）
  currentTheme = Object.assign({}, currentTheme, t);
  setBgVars(hexToRgb(currentTheme.bg));
  setColorVars(currentTheme);
  root.style.setProperty('--cmd-fg', currentTheme.fg);
  root.style.setProperty('--cmd-bright', currentTheme.fg);
  root.style.setProperty('--cmd-dim', currentTheme.dim || '#9a9ad6');
  root.style.setProperty('--cmd-accent', currentTheme.accent);
  root.style.setProperty('--cmd-green', currentTheme.green || '#33ff66');
  root.style.setProperty('--cmd-yellow', currentTheme.yellow || '#ffd633');
  applyAlpha(currentTheme.alpha ?? 1);
  // 设置控件已迁到独立窗口 renderer/settings.html，本窗口里没有这几个元素了。
  // 必须可选链：$('bgColor') 返回 null，直接 .value 会抛 TypeError 并中断整个脚本。
  const bg = $('bgColor'), fg = $('fgColor'), ac = $('acColor'), al = $('bgAlpha');
  if (bg) bg.value = currentTheme.bg;
  if (fg) fg.value = currentTheme.fg;
  if (ac) ac.value = currentTheme.accent;
  if (al) al.value = currentTheme.alpha ?? 1;
  // ⚠ 回环防护：主进程 save-theme 后会把 apply-theme 广播回本窗口（含自己），
  // 若这里再 saveTheme 就会无限循环。用 silent 标记跳过回写。
  if (bridge && !silent) bridge.saveTheme(currentTheme);
}

const PRESETS = {
  classic:   { bg:'#0000aa', fg:'#e8e8e8', dim:'#9a9ad6', accent:'#66ccff', green:'#33ff66', yellow:'#ffd633', alpha:1 },
  black:     { bg:'#0c0c10', fg:'#e6e6e6', dim:'#6a6a72', accent:'#5ad1ff', green:'#33ff66', yellow:'#ffd633', alpha:1 },
  green:     { bg:'#001400', fg:'#33ff66', dim:'#1f9f3f', accent:'#33ff66', green:'#33ff66', yellow:'#aaffaa', alpha:1 },
  amber:     { bg:'#140c00', fg:'#ffb000', dim:'#9a6a00', accent:'#ffb000', green:'#ffd633', yellow:'#ffb000', alpha:1 },
  transblue: { bg:'#0000aa', fg:'#e8e8e8', dim:'#9a9ad6', accent:'#66ccff', green:'#33ff66', yellow:'#ffd633', alpha:0.6 },
};
const PRESETS_REF = { classic: PRESETS.classic, black: PRESETS.black, green: PRESETS.green, amber: PRESETS.amber, transblue: PRESETS.transblue };
applyTheme(PRESETS.classic);

/* ---------- 日志 ---------- */
function log(msg, cls) {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = msg;
  const box = $('stdout');
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

/* ---------- 时间格式 ---------- */
function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}
function pathToUrl(p) { return encodeURI('file://' + p.replace(/\\/g, '/')); }
function extOf(p) { const m = p.match(/\.([^.]+)$/); return m ? m[1].toLowerCase() : ''; }

/* ---------- 音频图（首次播放时建立） ---------- */
function ensureAudioGraph() {
  if (state.audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  state.audioCtx = new Ctx();
  state.analyser = state.audioCtx.createAnalyser();
  state.analyser.fftSize = 2048;
  state.analyser.smoothingTimeConstant = 0.8;
  state.srcNode = state.audioCtx.createMediaElementSource(audio);
  state.srcNode.connect(state.analyser);
  state.analyser.connect(state.audioCtx.destination);
}

/* ---------- 播放列表 ---------- */
function addFile(file) {                       // 拖拽 / 文件选择器（File 对象）
  if (!/audio|\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(file.type + file.name)) return false;
  state.tracks.push({ name: file.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(file), path: file.name, dur: 0 });
  return true;
}
function addPath(p) {                          // 主进程回传的真实路径
  const name = p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  state.tracks.push({ name, url: pathToUrl(p), path: p, dur: 0 });
}
function addFiles(fileList) {
  const files = Array.from(fileList).filter(f => addFile(f));
  if (!files.length) { log('ERR: 未发现音频文件', 'err'); return; }
  log(`OK: 已添加 ${files.length} 个文件 → playlist`, 'ok');
  renderPlaylist();
  if (state.cur < 0) loadTrack(0);
}
function addPaths(paths) {
  if (!paths || !paths.length) return;
  paths.forEach(addPath);
  log(`OK: 已添加 ${paths.length} 个文件 → playlist`, 'ok');
  renderPlaylist();
  if (state.cur < 0) loadTrack(0);
}

function renderPlaylist() {
  const box = $('plList');
  box.innerHTML = '';
  state.tracks.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'row' + (i === state.cur ? ' cur' : '');
    row.innerHTML = `<span class="idx">${i === state.cur ? '▶' : String(i + 1).padStart(2, '0')}</span>` +
                    `<span class="name">${escapeHtml(t.name)}</span>` +
                    `<span class="dur">${t.dur ? fmtTime(t.dur) : '--:--'}</span>`;
    row.onclick = () => loadTrack(i, true);
    box.appendChild(row);
  });
  $('plMeta').textContent = `[ ${state.tracks.length} tracks ]`;
  invalidateZones();          // 行数/行高变了，热区标脏（函数声明已提升，可安全早调用）
}
function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

/* ---------- 载入/播放 ---------- */
// 音频格式：主进程 audioprobe.js 逐位解析文件头（WAV/MP3/FLAC/OGG/M4A），
// 不用 ffprobe、也不用文件扩展名 —— 扩展名会把 .m4a 报成 M4A，而真实编码是 AAC。
function fmtSampleRate(sr) {
  if (typeof sr !== 'number' || !isFinite(sr) || sr <= 0) return '--';
  return sr >= 1000 ? (sr / 1000).toFixed(1) + ' kHz' : sr + ' Hz';
}
function fmtChannels(ch) {
  if (typeof ch !== 'number' || !isFinite(ch) || ch <= 0) return '--';
  return ch === 1 ? 'mono' : ch === 2 ? 'stereo' : String(ch);
}
function probeTrackAudio(t) {
  // 先同步清空：异步 probe 返回前，上一首的残留值会挂在新歌的歌名上。
  $('aCodec').textContent = '--';
  $('aSample').textContent = '--';
  $('aBit').textContent = '--';
  $('aChannel').textContent = '--';
  if (!bridge) return;
  // 浏览器拖进来的 File 只有 file.name（见 addFile），不是真实路径，probe 必然失败。
  const p = t && t.path;
  if (typeof p !== 'string' || !/^[a-zA-Z]:[\\/]/.test(p)) return;
  bridge.probeAudio(p).then(r => {
    if (!r || !r.ok) return;   // 失败就保持 '--'，绝不回退到扩展名或默认值
    $('aCodec').textContent = r.codec || '--';
    $('aSample').textContent = fmtSampleRate(r.sampleRate);
    // bitDepth 对 MP3/Vorbis/Opus/AAC 恒为 null：有损格式文件里没这个概念，
    // 显示 '--'，绝不用 16 填坑。
    $('aBit').textContent = (typeof r.bitDepth === 'number' && r.bitDepth > 0) ? String(r.bitDepth) : '--';
    $('aChannel').textContent = fmtChannels(r.channels);
  }).catch(() => { /* 保持 '--' */ });
}
function loadTrack(i, autoplay) {
  if (i < 0 || i >= state.tracks.length) return;
  state.cur = i;
  const t = state.tracks[i];
  audio.src = t.url;
  audio.load();
  $('npTitle').textContent = t.name;
  $('npSub').textContent = 'localhost · ' + (t.path || t.name);
  const ex = extOf(t.path || t.name);
  $('progFmt').textContent = (ex ? ex.toUpperCase() : 'AUDIO') + ' · local file';
  probeTrackAudio(t);
  log(`> load "${t.name}"`, 'echo');
  renderPlaylist();
  reportNow();
  if (autoplay) play();
}
function reportNow() {
  if (bridge) bridge.nowPlaying({
    name: state.cur >= 0 ? state.tracks[state.cur].name : '(none)',
    state: state.playing ? 'PLAYING' : 'PAUSED',
    volume: state.volume,
  });
}
function play() {
  if (state.cur < 0 && state.tracks.length) loadTrack(0);
  if (state.cur < 0) return;
  ensureAudioGraph();
  if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
  audio.play().then(() => {
    state.playing = true;
    $('npDot').classList.add('on');
    $('npState').textContent = 'PLAYING';
    log('▶ PLAYING', 'ok');
  }).catch(e => log('ERR: ' + e.message, 'err'));
}
function pause() {
  audio.pause();
  state.playing = false;
  $('npDot').classList.remove('on');
  $('npState').textContent = 'PAUSED';
  log('⏸ PAUSED', 'warn');
}
function togglePlay() { state.playing ? pause() : play(); }
/* 音量：此前播放器没有音量概念，壁纸态控制条需要一个可被外部设置的值。
   作用到 audio.volume，并回报给主进程（主进程再推给控制条保持同步）。 */
function setVolume(v) {
  if (!isFinite(v)) return;
  state.volume = Math.min(1, Math.max(0, v));
  audio.volume = state.volume;
  reportNow();
}
function next() {
  if (!state.tracks.length) return;
  let i = state.shuffle ? Math.floor(Math.random() * state.tracks.length) : (state.cur + 1) % state.tracks.length;
  loadTrack(i, true);
}
function prev() {
  if (!state.tracks.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  let i = (state.cur - 1 + state.tracks.length) % state.tracks.length;
  loadTrack(i, true);
}

audio.addEventListener('loadedmetadata', () => {
  if (state.cur >= 0) state.tracks[state.cur].dur = audio.duration;
  $('tTot').textContent = fmtTime(audio.duration);
  renderPlaylist();
});
audio.addEventListener('ended', () => { if (state.loop) next(); else pause(); });
audio.addEventListener('play', () => { state.playing = true; $('npDot').classList.add('on'); $('npState').textContent = 'PLAYING'; reportNow(); });
audio.addEventListener('pause', () => { state.playing = false; $('npDot').classList.remove('on'); $('npState').textContent = 'PAUSED'; reportNow(); });

/* ---------- 进度（transform，无抖动） ---------- */
const progFill = $('progFill');
const progHandle = $('progHandle');
function updateProgress() {
  const p = audio.duration ? audio.currentTime / audio.duration : 0;
  progFill.style.transform = `scaleX(${p})`;
  progHandle.style.transform = `translateX(${p * $('prog').clientWidth}px)`;
  $('tCur').textContent = fmtTime(audio.currentTime);
}

/* ---------- Canvas 尺寸自适应（整数像素，杜绝抖动） ---------- */
function fitCanvas(cv) {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.floor(r.width * dpr));
  cv.height = Math.max(1, Math.floor(r.height * dpr));
}
function fitAll() { fitCanvas(specCanvas); fitCanvas(waveCanvas); }
window.addEventListener('resize', fitAll);

/* ---------- 可视化渲染循环 ---------- */
let freqData, timeData;
let lastT = performance.now(), frames = 0, fps = 0;
function renderLoop(now) {
  frames++;
  if (now - lastT >= 500) { fps = Math.round(frames * 1000 / (now - lastT)); frames = 0; lastT = now; $('statFps').textContent = fps; }

  const W = specCanvas.width, H = specCanvas.height;
  sctx.clearRect(0, 0, W, H);
  if (state.analyser && state.playing) {
    if (!freqData) { freqData = new Uint8Array(state.analyser.frequencyBinCount); timeData = new Uint8Array(state.analyser.fftSize); }
    state.analyser.getByteFrequencyData(freqData);
    const N = 48, colW = Math.floor(W / N), accent = getCss('--cmd-accent');
    sctx.fillStyle = accent;
    for (let i = 0; i < N; i++) {
      const start = Math.floor(Math.pow(i / N, 1.6) * freqData.length);
      const end = Math.max(start + 1, Math.floor(Math.pow((i + 1) / N, 1.6) * freqData.length));
      let v = 0; for (let j = start; j < end; j++) v = Math.max(v, freqData[j]);
      const h = Math.floor((v / 255) * H);
      sctx.fillRect(i * colW, H - h, colW - 1, h);
    }
    state.analyser.getByteTimeDomainData(timeData);
    const wW = waveCanvas.width, wH = waveCanvas.height;
    wctx.clearRect(0, 0, wW, wH);
    wctx.strokeStyle = accent; wctx.lineWidth = Math.max(1, wW / 600);
    wctx.beginPath();
    const step = Math.floor(timeData.length / wW) || 1;
    for (let x = 0, k = 0; x < wW; x++, k += step) {
      const y = (timeData[k] / 255) * wH;
      x === 0 ? wctx.moveTo(x, y) : wctx.lineTo(x, y);
    }
    wctx.stroke();
  } else {
    drawIdleSpectrum(W, H);
    drawIdleWave();
  }
  updateProgress();
  requestAnimationFrame(renderLoop);
}
function drawIdleSpectrum(W, H) {
  const accent = getCss('--cmd-accent');
  sctx.fillStyle = accent;
  const N = 48, colW = Math.floor(W / N), t = performance.now() / 600;
  for (let i = 0; i < N; i++) {
    const h = Math.floor((0.06 + 0.05 * Math.abs(Math.sin(t + i * 0.4))) * H);
    sctx.fillRect(i * colW, H - h, colW - 1, h);
  }
}
function drawIdleWave() {
  const wW = waveCanvas.width, wH = waveCanvas.height;
  wctx.clearRect(0, 0, wW, wH);
  wctx.strokeStyle = getCss('--cmd-accent'); wctx.lineWidth = Math.max(1, wW / 600);
  wctx.beginPath();
  const t = performance.now() / 400;
  for (let x = 0; x < wW; x++) {
    const y = wH / 2 + Math.sin(x / 24 + t) * (wH * 0.05);
    x === 0 ? wctx.moveTo(x, y) : wctx.lineTo(x, y);
  }
  wctx.stroke();
}
function getCss(v) { return getComputedStyle(root).getPropertyValue(v).trim() || '#66ccff'; }

/* ---------- 真实系统指标（主进程 sysmetrics.js + gpuperf.js 采样，非模拟） ---------- */
const GPU_TEXT = {
  HW: 'HW 硬件加速',
  SW: 'SW 软件渲染',
  OFF: 'OFF 已禁用',
  UNKNOWN: 'UNKNOWN',
};
/* GPU 占用率的显示规则（三种状态必须能区分，绝不把"没数据"画成 0）：
   1) p.ok === true  -> 显示真实数值（可能是 0，0 是"本进程确实没吃 GPU"）
   2) p 是空/未采样 -> '--'（还没采到，第一次要等 3 秒）
   3) p.ok === false -> 'E'（采样失败，鼠标悬停看 error）
   任务管理器那个「3D 9%」是【全机所有进程】的 GPU 占用；
   这里显示的是【本应用自己】吃的那一份，两者数量级可比但不相等。 */
function gpuPctText(p) {
  if (!p || !p.ts) return '--';
  if (p.ok && typeof p.gpuPct === 'number') return p.gpuPct.toFixed(0);
  return 'E';
}
function renderMetrics(d) {
  const m = d.m, g = d.g, p = d.p;
  // warmup=true 时 cpuPct 是「没有基准」填的 0，不是真的空闲 —— 显示 '--'，
  // 否则 0 会被读成「CPU 真的是 0」。
  const cpu = (m && m.warmup) ? null : (m ? m.cpuPct : null);
  const ram = m ? m.ramPct : null;
  $('statCpu').textContent = cpu == null ? '--' : cpu.toFixed(0);
  $('statRam').textContent = ram == null ? '--' : ram.toFixed(0);
  $('mCpu').style.width = (cpu == null ? 0 : cpu) + '%';
  $('mRam').style.width = (ram == null ? 0 : ram) + '%';

  const st = (g && g.gpu) || 'UNKNOWN';
  $('statGpu').textContent = gpuPctText(p);
  $('statGpu').title = '本应用占用的 GPU（3D 引擎），取自 Windows 性能计数器\n' +
    '\\GPU Engine(*)\\Utilization Percentage，按本应用各进程 pid 过滤\n' +
    (p && p.ok && p.gpuPct != null
      ? '当前 ' + p.gpuPct + '%   合计 ' + (p.totalPct == null ? '--' : p.totalPct + '%') +
        '\n引擎明细: ' + JSON.stringify(p.engines || {}) + '\n采样于 ' +
        ((Date.now() - p.ts) / 1000).toFixed(1) + ' 秒前'
      : (p && p.error ? '采样失败: ' + p.error
                      : '尚未完成第一次采样（约需 3 秒）'));

  const gs = $('gpuState');
  gs.textContent = GPU_TEXT[st] || st;
  // gpuDetail 排障用；SW 是本机实测状态（无独显），不是 bug，
  // 但它正是壁纸模式卡顿的真实成因，所以要让人一眼看见。
  gs.title = (g && g.gpuDetail ? g.gpuDetail + '\n' : '') +
    (st === 'SW' ? '当前为软件渲染，壁纸模式可能因此卡顿。' : '') +
    (p && p.note ? '\n' + p.note : '');
}
function tickMetrics() {
  if (!bridge) return;
  bridge.sysMetrics().then(d => { if (d && d.ok) renderMetrics(d); }).catch(() => { /* 采样失败保持上一次 */ });
}

/* ---------- 命令解析 ---------- */
$('cmdInput').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const raw = e.target.value.trim();
  e.target.value = '';
  if (!raw) return;
  log('C:\\MUSIC> ' + raw, 'echo');
  runCommand(raw);
});
function runCommand(raw) {
  const [cmd, ...args] = raw.split(/\s+/);
  switch (cmd.toLowerCase()) {
    // 面板抬头写的是「enter ? for help」，所以 '?' 必须是 help 的别名，
    // 否则用户照着提示敲 '?' 会得到「未知命令」。'h' 一并作为习惯性简写。
    case '?': case 'help': case 'h':
      log('可用命令：', 'ok');
      log('  ?, help        显示本帮助');
      log('  load           打开文件夹选择器（递归添加音乐）');
      log('  add            打开文件选择器添加单曲');
      log('  play [n]       播放（可选序号）');
      log('  next / prev    下一首 / 上一首');
      log('  loop           切换列表循环');
      log('  shuffle        切换随机播放');
      log('  scan           重新列出播放列表');
      log('  clear          清屏');
      log('  clear library  清空音乐库（同时清掉持久化的文件夹/单曲）');
      log('提示：壁纸模式下窗口不可点击，请用 Ctrl+Alt+C 控制面板或托盘菜单。');
      break;
    case 'load':  bridge && bridge.openFolder(); break;
    case 'add':   bridge && bridge.openFiles(); break;
    case 'play': {
      const n = parseInt(args[0], 10);
      if (args[0] && !isNaN(n)) loadTrack(n - 1, true);
      else if (state.cur >= 0) play();
      else if (state.tracks.length) loadTrack(0, true);
      else log('ERR: 播放列表为空，先用 load / add', 'err');
      break;
    }
    case 'next': next(); break;
    case 'prev': prev(); break;
    case 'loop': state.loop = !state.loop; log('LOOP ' + (state.loop ? 'ON' : 'OFF'), 'ok'); break;
    case 'shuffle': state.shuffle = !state.shuffle; log('SHUFFLE ' + (state.shuffle ? 'ON' : 'OFF'), 'ok'); break;
    case 'scan': renderPlaylist(); log('playlist 已刷新', 'ok'); break;
    // 注意：命令是按空白切分后再 switch 第一个词，所以 'clear library' 的第二个词
    // 只能从 args 里取 —— 写成 case 'clear library' 是永远匹配不到的死分支。
    case 'clear':
      if (args[0] && args[0].toLowerCase() === 'library') bridge && bridge.clearLibrary();
      else $('stdout').innerHTML = '';
      break;
    case 'clearlibrary': bridge && bridge.clearLibrary(); break;
    default: log('ERR: 未知命令 "' + cmd + '"，输入 help 查看', 'err');
  }
}

/* ---------- 按钮 / 交互 ---------- */
document.querySelectorAll('.np-ctrls button').forEach(b => {
  b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'play') togglePlay();
    else if (a === 'next') next();
    else if (a === 'prev') prev();
    else if (a === 'loop') { state.loop = !state.loop; b.classList.toggle('active', state.loop); log('LOOP ' + (state.loop ? 'ON' : 'OFF')); }
    else if (a === 'shuffle') { state.shuffle = !state.shuffle; b.classList.toggle('active', state.shuffle); log('SHUFFLE ' + (state.shuffle ? 'ON' : 'OFF')); }
  };
});

/* 文件选择（窗口态也可用） */
$('filePicker').addEventListener('change', e => addFiles(e.target.files));
$('folderPicker').addEventListener('change', e => addFiles(e.target.files));

/* 拖拽添加 */
['dragover', 'drop'].forEach(ev => stage.addEventListener(ev, e => {
  e.preventDefault();
  if (ev === 'drop' && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
}));

/* 标题栏按钮 → 主进程 */
$('btnMin').onclick = () => bridge && bridge.winMin();
$('btnMax').onclick = () => bridge && bridge.winMax();
$('btnClose').onclick = () => bridge && bridge.winClose();

/* ---------- 设置面板：已迁出 ----------
   原来的齿轮（btnSet）+ .settings 面板（含 bgColor/fgColor/acColor/bgAlpha/
   presets/btnMode/btnAdd）已整体删除，改为独立窗口 renderer/settings.html，
   入口在系统托盘右键菜单 →「⚙ 设置…」。
   原因：壁纸态那个齿轮是个死控件——挂进 WorkerW 的窗口收不到鼠标消息，
   192 点命中网格实测命中 0 个，mousemove 连续 110s 恒为 0。
   保留 applyTheme / PRESETS / setBgVars / applyAlpha 在本文件里，
   因为它们同时服务于「接收主进程广播的 apply-theme」。 */

/* ---------- 双模式切换（视觉部分，实际挂窗由主进程完成） ---------- */
function setMode(m) {
  state.mode = m;
  stage.classList.toggle('wallpaper', m === 'wallpaper');
  $('modeTag').textContent = m === 'wallpaper' ? '◧ WALLPAPER' : '◧ WINDOW';
  log('mode → ' + m.toUpperCase() + (m === 'wallpaper'
    ? ' （整屏覆盖壁纸：鼠标停在面板/按钮/歌单上才响应，其余区域点击直接落到桌面）'
    : ''), 'warn');
  // 关键：两种模式的背景【层数不同】——窗口态 .stage+.screen+.panel 三层，
  // 壁纸态 .stage 透明、只剩 .screen 一层。applyAlpha() 的反解依赖 n，
  // 所以切模式后必须重算，否则同一个滑块值在两种模式下实际不透明度不同。
  applyAlpha(currentTheme ? currentTheme.alpha : 1);
  applyPenetration();
  fitAll();
}

/* ---------- 壁纸态：按"鼠标下方是否是可交互控件"动态穿透 ----------
   ⚠ 重要：本节逻辑在【壁纸态永远不会被触发】，但请勿删除。
   实测依据（192 点命中网格 + 110 秒 mousemove 计数）：挂进 WorkerW 的窗口
   收不到任何鼠标消息——SysListView32（桌面图标列表）铺满全屏且 z 序在
   WorkerW 之上，命中我方窗口 0 个，mousemove 计数恒为 0。而本节全部逻辑
   只由 document 的 mousemove 驱动，所以 updatePenetration 不会被调用。
   setIgnoreMouseEvents 也解决不了：它管不了"别的窗口挡在你上面"。
   壁纸态的交互已由独立顶层窗口 renderer/dockbar.* 承担（控制条）。
   但本节在【窗口态】与【交互锁态】仍然生效，wallpaper 挂载失败降级时
   也可能用到，所以原样保留。
   之前的做法是"鼠标是否在 .stage 内 → 不穿透"，这在整屏铺满后必然失效：
   .stage 就是全屏，鼠标永远在里面，于是永远不穿透，桌面图标就点不动。
   正确做法：整屏铺满时默认【穿透】（点击落到真正的桌面），
   只有当鼠标下方命中可交互控件时才临时关闭穿透，控件即可正常点击。

   注意 main.js 侧 setIgnoreMouseEvents(on, { forward: true })：
   forward 保证"已穿透"状态下渲染层仍能收到 mousemove，才能做命中检测。 */
const HIT_SEL = [
  'button', 'input', 'select', 'textarea', 'label', 'a[href]',
  '.cmd-line', '.np-ctrls', '.progress',
  // 歌单只认"行"，不认整个面板：.pl-list 撑满整个面板，
  // 若把容器也列进来，面板里的空白会吞掉点击，桌面图标在那一块就点不动。
  '.pl-list .row', '.pl-list::-webkit-scrollbar',
  // 原 '.settings', '.set-actions', '.presets', '.h-gear' 已随设置 UI 迁出而删除，
  // 元素不存在时选择器匹配不到任何东西，留着只是误导。
].join(',');

/* ---------- 热区（zone）缓存：把"外扩后的控件包围盒"缓存下来 ----------

   为什么要外扩（这是本轮 bug 的真正修法）：
   setIgnoreMouseEvents 是【主进程 IPC，异步】，而 Windows 的点击判定
   发生在【按下瞬间】。链路是
       mousemove → 渲染层判断 → IPC → 主进程 → setIgnoreMouseEvents(false)
   若必须等鼠标真的落在控件像素上才关穿透，用户"瞄过去 → 立刻点"时
   关穿透还没生效，那一下就被穿透给桌面了 —— 控件永远点不准。
   整窗铺满 + 默认穿透的起点下，每一次移动都要靠这一拍，所以每个控件
   都变得又飘又点不准；设置面板这种"点开 → 再点小按钮"的链路最容易触发
   （用户反馈的正是"设置点不到 → 没法切回窗口"）。

   所以把判定从"鼠标是否在控件上"提前成"鼠标是否在控件附近"：
   鼠标进入【控件包围盒 + PAD】就提前关闭穿透，瞄准过程里穿透已经关掉了。
   这不是"把 IPC 调快"——调快只是把窗口变窄，外扩是消除按下瞬间的判定缺口。

   外扩不能来自"整块面板"：.pl-list 撑满面板，认容器会吞掉面板里的空白，
   桌面图标在那一块就点不动。所以热区只由【实际可交互元素】的包围盒生成
   （ZONE_SEL 剔除了 .pl-list 这个容器，只留 .pl-list .row）。

   外扩量取PAD（8px）的约束：实测歌单行高仅 18px且行行紧贴，
   基线探针的"歌曲行下方留白"点距末行底边只有 12px。
   PAD 一旦 >= 12 就会把这段留白判成可交互，吞掉桌面点击——
   这正是 app.js 里"歌单只认行不认容器"那条注释要防的事。
   所以 PAD 必须显著小于 12px。同时也不能太小：太小则退回原缺陷
   （鼠标压在控件上才关穿透，按下瞬间来不及）。
   8px 兼顾两侧：既让"瞄准过程中"穿透已关闭，又保住 12px 留白可穿透。

   迟滞（PAD_OUT > PAD_IN）：刚离开控件就交还桌面，会把用户紧接着点的
   桌面图标吃掉（反方向的同一个竞态）。这里只留 2px 差值——这个方向的
   竞态后果轻微（多点一次即可），而前面方向的后果是"被困在壁纸态出不来"，
   两者不对称，不能为了防轻微的而冒严重的。

   性能：mousemove 是高频事件，不能每次都遍历 getBoundingClientRect。
   热区只在【布局变化 / 滚动 / 面板开关 / 播放列表重绘】时标脏重建，
   并且带 ZONE_MAX_AGE 兜底自愈；mousemove 只做纯矩形命中判断。 */
const ZONE_SEL = HIT_SEL.split(',').filter(s => s && s.indexOf('::') < 0).join(',');
const PAD_IN = 8;              // 穿透中 → 进入可交互所需外扩（越小越早关穿透）
const PAD_OUT = 10;            // 可交互中 → 交还桌面所需外扩（略大，形成迟滞）
const ZONE_MAX_AGE = 1000;     // 热区最长缓存时间（ms），防止漏标脏导致长期失准
const LOOKAHEAD_MS = 50;       // 速度前瞻的时间窗：按当前速度外推"下一刻鼠标会在哪"
const LOOKAHEAD_MAX = 60;      // 前瞻的最大位移（px），防止一次抖动甩出巨大判定区
const MIN_DT = 4;              // 小于此间隔视为非真实采样间隔（同一批合成事件），不做外推
const MAX_DT = 200;            // 大于此间隔视为鼠标已停顿，不做外推
const FALLBACK_MS = 250;       // elementsFromPoint 兜底判定的最小间隔

let zones = [];
let zonesDirty = true;
let zonesBuiltAt = 0;
let lastMove = null;
let lastFallbackAt = 0;

function rebuildZones() {
  const out = [];
  const els = document.querySelectorAll(ZONE_SEL);
  for (let i = 0; i < els.length; i++) {
    const r = els[i].getBoundingClientRect();
    // display:none 的元素（如未展开的设置面板）尺寸为 0，必须跳过
    if (r.width > 0 && r.height > 0) out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  }
  zones = out;
  zonesDirty = false;
  zonesBuiltAt = performance.now();
}
function invalidateZones() { zonesDirty = true; }

/* 缓存矩形命中（外扩 pad）——mousemove 的主路径，O( zones ) 纯比较 */
function hitZones(x, y, pad) {
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (x >= z.l - pad && x <= z.r + pad && y >= z.t - pad && y <= z.b + pad) return true;
  }
  return false;
}

/* 兜底判定：elementFromPoint 只返回最顶层元素，被半透明层盖住时会判漏；
   elementsFromPoint 返回整条命中栈。代价较高（强制样式/布局计算），
   故限频调用。矩形判定缓存失效时它还能救回命中，并顺手标脏让缓存自愈。 */
function hitStack(x, y) {
  const now = performance.now();
  if (now - lastFallbackAt < FALLBACK_MS) return false;
  lastFallbackAt = now;
  let stack;
  try { stack = document.elementsFromPoint(x, y); } catch (_) { return false; }
  let hit = false;
  for (let i = 0; i < stack.length; i++) {
    const el = stack[i];
    if (el && el.closest && el.closest(HIT_SEL)) { hit = true; break; }
  }
  if (hit && !hitZones(x, y, 0)) invalidateZones();   // 缓存与真实命中不一致 → 自愈
  return hit;
}

function setIgnore(on) {
  if (!bridge || !bridge.setIgnoreMouse) return;
  if (state._ignore === on) return;      // 去重：避免每次 mousemove 都发 IPC
  state._ignore = on;
  bridge.setIgnoreMouse(on);
}
function applyPenetration() {
  invalidateZones();
  if (state.mode !== 'wallpaper') { setIgnore(false); return; }
  if (state.interactLock) { setIgnore(false); return; }
  // 不能无脑设穿透：切模式的瞬间鼠标可能【静止】在控件上，不会再有 mousemove
  // 来纠正，用户的第一下点击就又穿透给桌面了。用最后已知位置直接判定一次。
  if (lastMove) { updatePenetration(lastMove.x, lastMove.y); return; }
  setIgnore(true);
}
function updatePenetration(x, y) {
  if (state.mode !== 'wallpaper' || state.interactLock) return;
  const now = performance.now();
  if (zonesDirty || now - zonesBuiltAt > ZONE_MAX_AGE) rebuildZones();

  /* 鼠标快速甩向控件时，"当前是否已在控件上"这一刻仍可能为否——
     用户从远处一甩就到控件上并按下，中间没有一帧落在外扩带里。
     所以沿运动方向把判定点前推 LOOKAHEAD_MS（位移封顶 LOOKAHEAD_MAX），
     让"即将进入控件"也算命中，从根上消掉这一帧的缺口。 */
  let px = x, py = y;
  if (lastMove) {
    const dt = now - lastMove.t;
    if (dt >= MIN_DT && dt < MAX_DT) {
      let vx = (x - lastMove.x) / dt, vy = (y - lastMove.y) / dt;   // px/ms
      const dist = Math.min(LOOKAHEAD_MAX, Math.hypot(vx, vy) * LOOKAHEAD_MS);
      if (dist > 0.5) {
        const k = dist / Math.hypot(vx, vy);
        px = x + vx * k; py = y + vy * k;
      }
    }
  }
  lastMove = { x, y, t: now };

  // 迟滞：穿透中用较小外扩（尽早关穿透），可交互中用较大外扩（不急着交还桌面）
  const pad = state._ignore === false ? PAD_OUT : PAD_IN;
  setIgnore(!(hitZones(px, py, pad) || hitStack(x, y)));
}

/* 调试钩子：供 e2e 探针（probe_wallpaper_mode.js）观测穿透决策，不影响正常逻辑 */
window.__probe = {
  hitSel: HIT_SEL,
  zoneSel: ZONE_SEL,
  padIn: PAD_IN,
  padOut: PAD_OUT,
  get ignore() { return state._ignore; },
  get lock() { return state.interactLock; },
  get zoneCount() { return zones.length; },
  get zonesDirty() { return zonesDirty; },
  get zones() { return zones; },
  rebuildZones,
  invalidateZones,
  hitZones,
  setMode,
  applyTheme,
};

document.addEventListener('mousemove', (e) => {
  updatePenetration(e.clientX, e.clientY);
}, { passive: true });
// 布局变化 / 滚动 / 面板开关 / 播放列表重绘 → 热区缓存标脏（懒重建，不在 mousemove 里做）
window.addEventListener('resize', invalidateZones);
document.addEventListener('scroll', invalidateZones, { capture: true, passive: true });
// 键盘焦点回到窗口时，若鼠标并不在控件上，保持穿透状态
window.addEventListener('blur', () => {
  if (state.mode !== 'wallpaper' || state.interactLock) return;
  // 同applyPenetration：不能无脑穿透，要按最后已知鼠标位置判定
  if (lastMove) updatePenetration(lastMove.x, lastMove.y);
});

/* ---------- 主进程事件 ---------- */
if (bridge) {
  // 系统指标采样：1s 一次，由渲染层主动 invoke（主进程不推）。
  // 绝不放进 renderLoop —— 那是每帧 ~165 次，而差值采样要求 >=500ms 间隔。
  // 首次 tick 是 warmup，CPU/RAM 显示 '--'，第二个采样点起才有数值。
  tickMetrics();
  setInterval(tickMetrics, 1000);
  bridge.onState(s => setMode(s.mode));
  // 主进程把 save-theme 的结果广播回所有窗口（含本窗口自己）。
  // 必须 silent:true，否则 applyTheme → saveTheme → 广播 → applyTheme 无限循环。
  bridge.onApplyTheme(t => { if (t) applyTheme(t, { silent: true }); });
  bridge.onAddPaths(paths => addPaths(paths));
  bridge.onRunCommand(text => runCommand(text));
  bridge.onControl(action => {
    if (action === 'togglePlay') togglePlay();
    else if (action === 'next') next();
    else if (action === 'prev') prev();
    // 壁纸态控制条的音量滑块：主进程转发 'volume:<0~1>'（复用现成 control 通道）
    else if (action && action.indexOf('volume:') === 0) setVolume(parseFloat(action.slice(7)));
  });
  bridge.onLog(msg => log(msg, 'err'));
  // 主进程清空音乐库（托盘「🗑 清空音乐库」或 `clear library` 命令）
  bridge.onClearLibrary(() => {
    state.tracks = [];
    state.cur = -1;
    renderPlaylist();
    log('音乐库已清空', 'ok');
  });
  bridge.onDiagReport(rep => {
    log('──── 桌面壁纸层诊断报告 ────', 'warn');
    String(rep || '(空)').split(/\r?\n/).forEach(l => log('  ' + l, 'dim'));
    log('报告已存到 %TEMP%\\cmdmusic_wallpaper_diag.txt，可直接发给 AI。', 'warn');
    log('───────────────────────────', 'warn');
  });
  bridge.onInteractLock(on => {
    state.interactLock = !!on;
    $('lockTag').textContent = state.interactLock ? '🔒 LOCK' : '';
    applyPenetration();
    log(state.interactLock
      ? '交互锁定 ON —— 整窗强制可交互（桌面图标暂时点不到，Ctrl+Alt+L 解除）'
      : '交互锁定 OFF —— 恢复动态穿透：鼠标停在面板/按钮/歌单上才响应，其余点击落到桌面', 'warn');
  });
}

/* ---------- 快捷键（窗口聚焦时生效；壁纸模式用媒体键/全局快捷键） ---------- */
window.addEventListener('keydown', (e) => {
  if (e.target === $('cmdInput')) return;
  if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); bridge && bridge.openFiles(); return; }
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (e.key.toLowerCase() === 'n') next();
  else if (e.key.toLowerCase() === 'p') prev();
});

/* ---------- 启动 ---------- */
function boot() {
  fitAll();
  log('CMD-MUSIC terminal audio player v0.2 (electron)', 'ok');
  log('输入 help 查看命令；或点右上角齿轮调主题 / 加音乐。', 'dim');
  log('Ctrl+Alt+W 切换 壁纸/窗口；Ctrl+Alt+L 交互锁；Ctrl+Alt+C 控制面板；媒体键播放/上下首。', 'dim');
  requestAnimationFrame(renderLoop);
}
boot();
