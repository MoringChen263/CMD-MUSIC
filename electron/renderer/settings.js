/* ============================================================
   settings.js — 独立设置窗口逻辑
   ⚠ 第一行必须且只能叫 bridge：
   preload 用 contextBridge.exposeInMainWorld('api', {...}) 注入了一个
   non-configurable 的全局属性 api。若这里写 `const api = window.api`，
   会抛 "Identifier 'api' has already been declared"，整个脚本不执行，
   窗口一片空白。这是本项目已踩过的坑，不要改名。
   ============================================================ */
const bridge = window.api;

const PRESETS = {
  classic:   { bg:'#0000aa', fg:'#e8e8e8', dim:'#9a9ad6', accent:'#66ccff', green:'#33ff66', yellow:'#ffd633', alpha:1 },
  black:     { bg:'#0c0c10', fg:'#e6e6e6', dim:'#6a6a72', accent:'#5ad1ff', green:'#33ff66', yellow:'#ffd633', alpha:1 },
  green:     { bg:'#001400', fg:'#33ff66', dim:'#1f9f3f', accent:'#33ff66', green:'#33ff66', yellow:'#aaffaa', alpha:1 },
  amber:     { bg:'#140c00', fg:'#ffb000', dim:'#9a6a00', accent:'#ffb000', green:'#ffd633', yellow:'#ffb000', alpha:1 },
  transblue: { bg:'#0000aa', fg:'#e8e8e8', dim:'#9a9ad6', accent:'#66ccff', green:'#33ff66', yellow:'#ffd633', alpha:0.6 },
};

/* 当前主题（本地影子副本）。主进程是唯一权威，但控件回填需要一份同步的快照。 */
let theme = Object.assign({}, PRESETS.classic);

const $ = (id) => document.getElementById(id);

/* 故障提示条：用户不打开 devtools 也能看到问题 */
function showError(msg) {
  const bar = $('errBar');
  if (!bar) { console.error(msg); return; }
  bar.textContent = 'ERR: ' + msg;
  bar.hidden = false;
  console.error(msg);
}

function fill(t) {
  if (!t) t = PRESETS.classic;
  // 用 classic 补齐缺字段，避免 undefined 写进 color input（会被判为非法值）
  theme = Object.assign({}, PRESETS.classic, t);
  const bg = $('bgColor'), fg = $('fgColor'), ac = $('acColor'), al = $('bgAlpha');
  if (bg) bg.value = theme.bg;
  if (fg) fg.value = theme.fg;
  if (ac) ac.value = theme.accent;
  if (al) al.value = theme.alpha;
}

/* 单字段改动：整对象回传（save-theme 是整体替换语义，字段必须齐全） */
function patch(key, val) {
  theme = Object.assign({}, theme, { [key]: val });
  try { bridge.saveTheme(theme); } catch (e) { showError('saveTheme 失败: ' + ((e && e.message) || e)); }
}

try {
  if (!bridge) throw new Error('preload 未注入 window.api');

  // 启动时向主进程要当前主题；拿不到就用 classic 兜底
  try { bridge.requestTheme(); } catch (e) { showError('requestTheme 失败: ' + ((e && e.message) || e)); }
  fill(null);

  // 任何来源改了主题都回填控件（主窗口 / 托盘 / 其他窗口）
  bridge.onApplyTheme((t) => { try { fill(t); } catch (e) { showError('回填主题失败: ' + ((e && e.message) || e)); } });

  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

  on('bgColor', 'input', (e) => patch('bg', e.target.value));
  on('fgColor', 'input', (e) => patch('fg', e.target.value));
  on('acColor', 'input', (e) => patch('accent', e.target.value));
  on('bgAlpha', 'input', (e) => {
    const n = parseFloat(e.target.value);
    if (isFinite(n)) patch('alpha', n);
  });

  // 预设：整对象替换
  document.querySelectorAll('.presets button').forEach((b) => {
    b.addEventListener('click', () => {
      const p = PRESETS[b.getAttribute('data-preset')];
      if (!p) return;
      theme = Object.assign({}, p);
      fill(theme);
      try { bridge.saveTheme(theme); } catch (e) { showError('saveTheme 失败: ' + ((e && e.message) || e)); }
    });
  });

  on('btnMode', 'click', () => { try { bridge.toggleMode(); } catch (e) { showError('toggleMode 失败: ' + ((e && e.message) || e)); } });
  on('btnAdd', 'click', () => { try { bridge.openFiles(); } catch (e) { showError('openFiles 失败: ' + ((e && e.message) || e)); } });
  on('btnClose', 'click', () => { try { bridge.closeSettings(); } catch (e) { showError('closeSettings 失败: ' + ((e && e.message) || e)); } });
} catch (e) {
  showError((e && e.message) || String(e));
}
