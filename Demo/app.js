/* ============================================================
   CMD-MUSIC Demo — app.js
   经典 cmd.exe 风格音乐播放器 · 最小可用测试 Demo
   - 真实本地音乐播放（Web Audio AnalyserNode 驱动可视化）
   - Canvas 整数格频谱/波形，杜绝字体度量抖动
   - 进度条用 transform: scaleX / translateX，GPU 位移不抖
   - 主题色整屏跟随（含内部面板）
   - 壁纸 / 窗口 双模式切换
   ============================================================ */
'use strict';

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const audio = new Audio();
audio.crossOrigin = 'anonymous';

const specCanvas = $('specCanvas');
const waveCanvas = $('waveCanvas');
const sctx = specCanvas.getContext('2d');
const wctx = waveCanvas.getContext('2d');

/* ---------- 状态 ---------- */
const state = {
  tracks: [],          // { name, url, file, dur }
  cur: -1,
  playing: false,
  loop: true,
  shuffle: false,
  mode: 'window',      // 'window' | 'wallpaper'
  audioCtx: null,
  analyser: null,
  srcNode: null,
};

/* ---------- 主题系统（整屏跟随） ---------- */
const root = document.documentElement;
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function setBgVars(rgb) { root.style.setProperty('--cmd-bg-rgb', rgb.join(', ')); }

function applyTheme(t) {
  setBgVars(hexToRgb(t.bg));
  root.style.setProperty('--cmd-bg-alpha', t.alpha ?? 1);
  root.style.setProperty('--cmd-fg', t.fg);
  root.style.setProperty('--cmd-bright', t.fg);
  root.style.setProperty('--cmd-dim', t.dim || '#9a9ad6');
  root.style.setProperty('--cmd-accent', t.accent);
  root.style.setProperty('--cmd-green', t.green || '#33ff66');
  root.style.setProperty('--cmd-yellow', t.yellow || '#ffd633');
  // 同步设置面板控件
  $('bgColor').value = t.bg;
  $('fgColor').value = t.fg;
  $('acColor').value = t.accent;
  $('bgAlpha').value = t.alpha ?? 1;
}

const PRESETS = {
  classic:   { bg:'#0000aa', fg:'#e8e8e8', dim:'#9a9ad6', accent:'#66ccff', green:'#33ff66', yellow:'#ffd633', alpha:1 },
  black:     { bg:'#0c0c10', fg:'#e6e6e6', dim:'#6a6a72', accent:'#5ad1ff', green:'#33ff66', yellow:'#ffd633', alpha:1 },
  green:     { bg:'#001400', fg:'#33ff66', dim:'#1f9f3f', accent:'#33ff66', green:'#33ff66', yellow:'#aaffaa', alpha:1 },
  amber:     { bg:'#140c00', fg:'#ffb000', dim:'#9a6a00', accent:'#ffb000', green:'#ffd633', yellow:'#ffb000', alpha:1 },
  transblue: { bg:'#0000aa', fg:'#e8e8e8', dim:'#9a9ad6', accent:'#66ccff', green:'#33ff66', yellow:'#ffd633', alpha:0.6 },
};
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
function addFiles(fileList) {
  const files = Array.from(fileList).filter(f => /audio|\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(f.type + f.name));
  if (!files.length) { log('ERR: 未发现音频文件', 'err'); return; }
  files.forEach(f => {
    state.tracks.push({ name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f), file: f, dur: 0 });
  });
  log(`OK: 已添加 ${files.length} 个文件 → playlist`, 'ok');
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
}
function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

/* ---------- 载入/播放 ---------- */
function loadTrack(i, autoplay) {
  if (i < 0 || i >= state.tracks.length) return;
  state.cur = i;
  audio.src = state.tracks[i].url;
  audio.load();
  $('npTitle').textContent = state.tracks[i].name;
  $('npSub').textContent = 'localhost · local file';
  log(`> load "${state.tracks[i].name}"`, 'echo');
  renderPlaylist();
  if (autoplay) play();
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

function next() {
  if (!state.tracks.length) return;
  let i;
  if (state.shuffle) i = Math.floor(Math.random() * state.tracks.length);
  else i = (state.cur + 1) % state.tracks.length;
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
audio.addEventListener('play', () => { state.playing = true; $('npDot').classList.add('on'); $('npState').textContent = 'PLAYING'; });
audio.addEventListener('pause', () => { state.playing = false; $('npDot').classList.remove('on'); $('npState').textContent = 'PAUSED'; });

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
  // FPS
  frames++;
  if (now - lastT >= 500) { fps = Math.round(frames * 1000 / (now - lastT)); frames = 0; lastT = now; $('statFps').textContent = fps; }

  const W = specCanvas.width, H = specCanvas.height;
  sctx.clearRect(0, 0, W, H);
  if (state.analyser && state.playing) {
    if (!freqData) { freqData = new Uint8Array(state.analyser.frequencyBinCount); timeData = new Uint8Array(state.analyser.fftSize); }
    state.analyser.getByteFrequencyData(freqData);
    const N = 48;
    const colW = Math.floor(W / N);
    const accent = getCss('--cmd-accent');
    sctx.fillStyle = accent;
    for (let i = 0; i < N; i++) {
      // 取该频段代表值（对数映射，低频更密）
      const start = Math.floor(Math.pow(i / N, 1.6) * freqData.length);
      const end = Math.max(start + 1, Math.floor(Math.pow((i + 1) / N, 1.6) * freqData.length));
      let v = 0; for (let j = start; j < end; j++) v = Math.max(v, freqData[j]);
      const h = Math.floor((v / 255) * H);
      const x = i * colW;
      // 整数格绘制，无字体度量抖动
      sctx.fillRect(x, H - h, colW - 1, h);
    }
    // 波形
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
    // 空闲态：画一条平静基线 + 极轻波动，避免"死屏"
    drawIdleSpectrum(W, H);
    drawIdleWave();
  }

  // 模拟系统参数（标注 demo）
  simStats();
  updateProgress();
  requestAnimationFrame(renderLoop);
}

function drawIdleSpectrum(W, H) {
  const accent = getCss('--cmd-accent');
  sctx.fillStyle = accent;
  const N = 48, colW = Math.floor(W / N);
  const t = performance.now() / 600;
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

/* ---------- 模拟系统参数（仅演示） ---------- */
let sim = { cpu: 6, gpu: 12, ram: 38 };
function simStats() {
  sim.cpu = clamp(sim.cpu + (Math.random() - 0.5) * 2, 3, 40);
  sim.gpu = clamp(sim.gpu + (Math.random() - 0.5) * 3, 5, 55);
  sim.ram = clamp(sim.ram + (Math.random() - 0.5) * 1, 30, 60);
  $('statCpu').textContent = sim.cpu.toFixed(0);
  $('statGpu').textContent = sim.gpu.toFixed(0);
  $('statRam').textContent = sim.ram.toFixed(0);
  $('mCpu').style.width = sim.cpu + '%';
  $('mGpu').style.width = sim.gpu + '%';
  $('mRam').style.width = sim.ram + '%';
}
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

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
    case 'help':
      log('可用命令：', 'ok');
      log('  load           打开文件夹选择器添加音乐（demo 无真实路径）');
      log('  add            打开文件选择器添加单曲');
      log('  play [n]       播放（可选序号）');
      log('  next / prev    下一首 / 上一首');
      log('  loop           切换列表循环');
      log('  shuffle        切换随机播放');
      log('  scan           重新列出播放列表');
      log('  clear          清屏');
      break;
    case 'load':  $('folderPicker').click(); break;
    case 'add':   $('filePicker').click(); break;
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
    case 'clear': $('stdout').innerHTML = ''; break;
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

/* 文件选择 */
$('filePicker').addEventListener('change', e => addFiles(e.target.files));
$('folderPicker').addEventListener('change', e => addFiles(e.target.files));

/* 拖拽添加 */
['dragover', 'drop'].forEach(ev => stage.addEventListener(ev, e => {
  e.preventDefault();
  if (ev === 'drop') {
    const dt = e.dataTransfer;
    if (dt.files && dt.files.length) addFiles(dt.files);
  }
}));

/* 设置面板 */
$('btnAdd').onclick = () => $('filePicker').click();
const settings = $('settings');
function toggleSettings(force) {
  const show = force ?? !settings.classList.contains('show');
  settings.classList.toggle('show', show);
}
$('setClose').onclick = () => toggleSettings(false);
$('btnSet').onclick = () => toggleSettings();   // 齿轮：开/关主题面板
$('btnMode').onclick = () => toggleMode();

/* 主题控件 */
function bindColor(id, fn) { $(id).addEventListener('input', e => fn(e.target.value)); }
bindColor('bgColor', v => setBgVars(hexToRgb(v)));
bindColor('fgColor', v => { root.style.setProperty('--cmd-fg', v); root.style.setProperty('--cmd-bright', v); });
bindColor('acColor', v => root.style.setProperty('--cmd-accent', v));
$('bgAlpha').addEventListener('input', e => root.style.setProperty('--cmd-bg-alpha', e.target.value));
document.querySelectorAll('.presets button').forEach(b => {
  b.onclick = () => applyTheme(PRESETS[b.dataset.preset]);
});

/* ---------- 双模式切换（壁纸 ↔ 窗口） ---------- */
function toggleMode() {
  state.mode = state.mode === 'window' ? 'wallpaper' : 'window';
  stage.classList.toggle('wallpaper', state.mode === 'wallpaper');
  $('modeTag').textContent = state.mode === 'wallpaper' ? '◧ WALLPAPER' : '◧ WINDOW';
  log('mode → ' + state.mode.toUpperCase() + (state.mode === 'wallpaper' ? ' （点击穿透，仅设置面板可操作）' : ''), 'warn');
  fitAll();
}

/* ---------- 快捷键 ---------- */
window.addEventListener('keydown', (e) => {
  if (e.target === $('cmdInput')) return; // 命令框内不抢键
  if ((e.ctrlKey || e.altKey) && e.altKey && e.key.toLowerCase() === 'w') { e.preventDefault(); toggleMode(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); $('filePicker').click(); return; }
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (e.key.toLowerCase() === 'n') next();
  else if (e.key.toLowerCase() === 'p') prev();
});

/* ---------- 启动 ---------- */
function boot() {
  fitAll();
  log('CMD-MUSIC terminal audio player v0.1 (demo)', 'ok');
  log('输入 help 查看命令；或点右上角齿轮调主题 / 加音乐。', 'dim');
  log('提示：把音频文件拖进窗口，或按 Ctrl+O 选择。', 'dim');
  requestAnimationFrame(renderLoop);
}
boot();
