/* ============================================================
   dockbar.js — 壁纸态浮动控制条逻辑
   这个窗口【不进 WorkerW】，保持顶层窗口身份，所以它能正常收到鼠标消息，
   是壁纸态下唯一可交互的入口（主窗口在壁纸态收不到任何鼠标事件）。
   ============================================================ */
'use strict';

// 注意：preload 通过 contextBridge 注入的全局名是 `api`（window.api）。
// 这里【绝不能】写 `const api = window.api;` —— 那会与全局 `api` 撞名，
// 抛 "Identifier 'api' has already been declared"。这是【解析期】语法错误，
// 整个 dockbar.js 一行都不执行：所有按钮都不响应，而且不产生可见报错。
// app.js:15 / control-panel.js:9 都是改名为 bridge，这里必须保持一致。
const bridge = window.api;
const $ = (id) => document.getElementById(id);

/* ---------- 命令发送 ---------- */
function cmd(action) { if (bridge) bridge.dockCommand(action); }

$('btnPrev').onclick     = () => cmd('prev');
$('btnNext').onclick     = () => cmd('next');
$('btnPlay').onclick     = () => cmd('togglePlay');
$('btnSettings').onclick = () => cmd('settings');
$('btnMode').onclick     = () => cmd('toggleMode');

/* ---------- 音量 ----------
   主进程把 'volume:<0~1>' 转发给主窗口渲染层，由它作用到 audio.volume
   （音量真值在渲染层，这里不重复造状态）。 */
const volEl = $('vol');
let volLocal = null;   // 用户操作后的本地值，避免主进程回声把滑块拉回去

volEl.addEventListener('input', () => {
  const v = Number(volEl.value) / 100;
  volLocal = v;
  cmd('volume:' + v);
});

/* ---------- 状态渲染 ---------- */
const btnPlay = $('btnPlay');
let curTitle = '';

function render(s) {
  s = s || {};
  // 播放/暂停图标必须反映真实播放状态：playing ⏸ / 暂停 ⏯
  const playing = !!s.playing;
  btnPlay.innerHTML = playing ? '&#10073;&#10073;' : '&#9199;';
  btnPlay.classList.toggle('playing', playing);
  btnPlay.title = playing ? '暂停' : '播放';

  const t = s.title || '(none)';
  if (t !== curTitle) { curTitle = t; $('npTitle').textContent = t; }
  $('npSub').textContent = s.artist || (s.mode === 'wallpaper' ? 'WALLPAPER MODE' : 'WINDOW MODE');

  // 音量回显：用户刚拖过就以本地值为准，否则用主进程推来的值
  const v = volLocal !== null ? volLocal : (typeof s.volume === 'number' ? s.volume : 1);
  volEl.value = String(Math.round(v * 100));

  // 壁纸态才显示切回窗口模式的提示
  $('btnMode').innerHTML = s.mode === 'wallpaper' ? '&#9632;' : '&#9633;';
  $('btnMode').title = s.mode === 'wallpaper' ? '切回窗口模式' : '切换到壁纸模式';
}

if (bridge) bridge.onDockState(render);
render({});
