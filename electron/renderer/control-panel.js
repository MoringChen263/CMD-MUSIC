/* 控制面板（Ctrl+Alt+C）逻辑：壁纸模式下交互入口 */
'use strict';
// 注意：preload 通过 contextBridge 注入的全局名是 `api`（window.api）。
// 这里【绝不能】写 `const api = window.api;` —— 那会与全局 `api` 撞名，
// 抛 "Identifier 'api' has already been declared"。这是【解析期】语法错误，
// 整个 control-panel.js 一行都不执行：按钮全部点不动、输入框不响应、连 window.close 都没绑，
// 而且不产生任何可见报错（面板照常显示），正是用户报告的「面板能开但什么都点不动」。
// app.js 早就为此把局部常量改名为 bridge，这里必须保持一致。
const bridge = window.api;
const $ = (id) => document.getElementById(id);

$('cpFiles').onclick = () => bridge && bridge.openFiles();
$('cpFolder').onclick = () => bridge && bridge.openFolder();
$('cpMode').onclick = () => bridge && bridge.toggleMode();
$('cpClose').onclick = () => window.close();

$('cpInput').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const t = e.target.value.trim();
  e.target.value = '';
  if (t && bridge) bridge.sendCommand(t);
});

if (bridge) {
  bridge.onNowPlaying(info => {
    $('cpNow').textContent = info.name || '--';
    $('cpState').textContent = info.state || '--';
  });
}
