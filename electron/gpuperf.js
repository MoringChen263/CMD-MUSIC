/* ============================================================
   gpuperf.js — 本进程的真实 GPU 占用率（Windows 性能计数器）

   为什么需要这个文件：
   任务管理器「性能 → GPU → 利用率」那个数字来自 Windows 性能计数器
   `\GPU Engine(*)\Utilization Percentage`，它【是可读的】。
   （早前"Node 拿不到 GPU 占用率"的说法是错的，本文件就是反证。）

   为什么不直接用 GPU 占用率替换状态显示：
   两者回答的是不同问题，缺一不可。
     - gpuStatus()（在 sysmetrics.js）回答「这台机器/这个环境能不能硬件加速」。
       它是恒定的环境状态，对 wallpaper 模式的价值在于：一旦是 SW 软件渲染，
       就能解释"为什么壁纸模式卡"。
     - 本文件回答「本应用此刻吃多少 GPU」。这是动态值，随播放/频谱变化，
       才是用户真正想看的"利用率"。
   所以两者都要，UI 上并列显示（状态 + 占用率）。

   ⚠ 实测到的两个硬约束（决定了本文件的实现方式）：

   (1) typeperf 一次调用要 2400ms —— 绝对不能用来轮询。
       实测：typeperf '\\GPU Engine(*)\\Utilization Percentage' -sc 1
       耗时 2421ms。若每秒调一次，光采样就吃掉一个核。

   (2) Get-Counter（PowerShell）可用，且能按 pid 过滤，
       耗时在百毫秒级（本项目实测见 probe_gpu_real.log）。
       但它每次都要起一个 powershell.exe 子进程，仍有固定开销。

   因此本文件的策略是：
     - **低频**：默认 3000ms 一次，由 startGpuPerf() 内部定时器驱动，
       不挂在渲染层的 1s sys-metrics 轮询上（那会把开销放大 3 倍）。
     - **只取本进程相关的 pid**：先按 pid 过滤，避免把整张计数表
       （实测一次 typeperf 输出 54KB、上千个实例）全量搬回来。
     - **同步返回缓存值**：渲染层读的是缓存，采样在后台跑，
       绝不让 UI 等着子进程。
     - **失败即 null，绝不补 0**：计数器读不到就说读不到。
       0 和"没数据"在 UI 上必须能区分，否则又是一轮假数据。

   导出
     startGpuPerf(intervalMs)  启动后台采样（幂等）
     stopGpuPerf()             停掉定时器 + 释放
     getGpuPerf()              取缓存 { ok, gpuPct, engines, ts, error }
*/
'use strict';

const { execFile } = require('child_process');
const os = require('os');

const DEFAULT_INTERVAL = 3000;
const EXEC_TIMEOUT = 5000;          // 超过就放弃本次采样，不拖住下一次
const MAX_BUFFER = 1024 * 1024;     // 1MB 上限，防止计数器表爆掉把内存吃满

let timer = null;
let running = false;                // 防重入：上一轮还没回来就不发下一次
let cache = { ok: false, gpuPct: null, engines: null, ts: 0, error: '未采样',
              note: null, parse: null };

/* 本进程需要关注的 pid 集合。
   Electron 是多进程的：主进程 + 渲染进程 + GPU 进程 + 工具进程，
   真正产生 GPU 负载的是【渲染进程】和【GPU 进程】。
   只认 process.pid 会漏掉渲染进程。 */
function ownPids() {
  const s = new Set([process.pid]);
  // main.js 会把 app.getAppMetrics() 的 pid 塞进来（见 attachAppMetrics）
  if (Array.isArray(extraPids)) for (const p of extraPids) if (Number.isInteger(p) && p > 0) s.add(p);
  return s;
}
let extraPids = null;
/** 由 main.js 调用，传入 app.getAppMetrics() 的 pid 列表（渲染/GPU 进程）。 */
function setAppPids(list) { extraPids = Array.isArray(list) ? list.slice() : null; }

/* 解析 Get-Counter 的输出。
   ⚠⚠ 2026-10-04 实测纠正：这才是真实输出格式——
     pid_23240_luid_0x00000000_0x00016002_phys_0_eng_0_engtype_3d=0.384067112857201
   也就是【等号分隔】、实例名里 engtype 全小写（3d / copy / videodecode…），
   本机一次 647 个实例。原来的正则写成了 "InstanceName,CookedValue"（逗号），
   一条都匹配不上，于是 647 行全部被静默丢弃，最后报
   「未匹配到本进程的 GPU 引擎实例」——听起来像"本进程没用 GPU"，
   其实是格式没认出来。假失败比假绿灯更难查，因为它自带一个合理的解释。
   下面三种形态都保留，并且会回报 matched 计数，让"没解析出来"和
   "解析了但本进程确实没有"这两件事在 UI 上能区分开。 */
function parseCounterCsv(text, pidSet) {
  const out = new Map();          // engtype -> 该引擎类型的所有实例之和
  const lines = String(text || '').split(/\r?\n/);
  let matched = 0;                // 认出来的计数器行数（含非本进程的）
  let kept = 0;                   // 其中通过 pid 过滤且数值>0 的

  /* ⚠⚠ 这里绝对不能用 \b。
     实例名是 pid_11772_luid_0x...，而 '_' 属于 \w（word 字符），
     所以 "11772" 和 "_luid" 之间【不存在词边界】，`(\d+)\b` 永远不成立。
     2026-10-04 就是这么写的，661 行真实输出认到 0 行，
     而错误信息长得像"本进程没 GPU 负载"，极具误导性。
     正确做法：直接靠 pid_ 前缀 + 数字贪婪吃，pid_ 后面跟的
     一定是数字，下一个字符（下划线）天然终止匹配。 */
  // 形态 A1（本项目实际使用的脚本输出）：`实例名=数值`
  const RE_EQ = /^\s*"?([^"=]*?pid_(\d+)[^"=]*?)"?\s*=\s*"?([0-9.eE+-]+)"?\s*$/;
  // 形态 A2：带表头的 CSV，`"InstanceName","CookedValue"`（Get-Counter 默认输出）
  const RE_CSV = /"?([^"]*?pid_(\d+)[^"]*?)"?\s*,\s*"?([0-9.eE+-]+)"?\s*$/;
  for (const ln of lines) {
    const m = ln.match(RE_EQ) || ln.match(RE_CSV);
    if (!m) continue;
    matched++;
    const pid = Number(m[2]);
    if (pidSet && !pidSet.has(pid)) continue;      // 只要本进程的
    // 从实例名里抠出引擎类型，统一小写（真实输出是 engtype_3d）
    const t = m[1].match(/engtype_([A-Za-z0-9_]+)/i);
    const key = t ? String(t[1]).toLowerCase() : 'other';
    const v = parseFloat(m[3]);
    if (!Number.isFinite(v) || v <= 0) continue;
    kept++;
    out.set(key, (out.get(key) || 0) + v);
  }

  // 形态 B：typeperf 的宽 CSV —— 表头行里直接列出上千个实例名，
  // 数值在下面一行。这种没法靠行正则对应实例名，只能取该行所有正值求和
  // （精度较差，但总不至于恒为 0）。仅在形态 A 一条都没匹配上时才启用。
  if (matched === 0) {
    for (const ln of lines) {
      if (/^\s*"?\(?PDH/i.test(ln)) continue;      // 表头
      if (!/\d{4}[/-]\d{1,2}[/-]\d{1,2}/.test(ln)) continue;  // 时间戳行
      const nums = ln.match(/\d+\.\d{6,}/g);
      if (!nums) continue;
      for (const s of nums) {
        const v = parseFloat(s);
        if (Number.isFinite(v) && v > 0) { out.set('total', (out.get('total') || 0) + v); kept++; }
      }
      if (out.size) { matched = lines.length; break; }
    }
  }

  // 挂诊断信息（不改 Map 的语义，size/get/set 全都照常）
  out.__stat = { totalLines: lines.length, matched, kept };
  return out;
}

/* 跑一次 Get-Counter。Promise 化，带超时。 */
function runOnce() {
  return new Promise((resolve) => {
    // 只取 3D / Copy / VideoDecode 这几个对播放器有意义的引擎，
    // 但计数器实例名是通配的，拿不到"只要某几种"，
    // 所以仍然取全量再在解析阶段按 engtype 挑。
    const ps =
      "$ErrorActionPreference='Stop';" +
      "(Get-Counter '\\GPU Engine(*)\\Utilization Percentage').CounterSamples | " +
      "ForEach-Object { '{0}={1}' -f $_.InstanceName, $_.CookedValue }";
    /* ⚠⚠ 不要对 ps 做任何引号转义。
       2026-10-04 实测踩过：原来这里写了 ps.replace(/'/g, "''")，
       结果 execFile 报
         Command failed: ... $ErrorActionPreference=''Stop'';...
       原因是 `''` 是 PowerShell【字符串字面量内部】的转义规则，
       而 execFile 是把整个脚本当作一个 argv 元素【原样传过去】的，
       没有任何 shell 在中间做解析。翻倍引号等于把脚本改坏。
       这类"看起来更安全"的转义，在没有 shell 参与时是纯破坏。
       代价：探针报 ALL PASS 但真实采样那项其实 error=Command failed，
       断言只检查了结构完整性、没断言"真的取到数"，于是绿灯是假的。 */
    const psSafe = ps;
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psSafe],
      { windowsHide: true, timeout: EXEC_TIMEOUT, maxBuffer: MAX_BUFFER },
      (err, so, se) => {
        if (err && !so) {
          resolve({ ok: false, error: String(err.message || err).split('\n')[0] });
          return;
        }
        resolve({ ok: true, text: (so || '') + (se || '') });
      });
  });
}

async function sampleOnce() {
  if (process.platform !== 'win32') {
    cache = { ok: false, gpuPct: null, engines: null, ts: Date.now(), error: '非 Windows，无此计数器' };
    return cache;
  }
  if (running) return cache;                 // 上一轮未结束，跳过本轮
  running = true;
  try {
    const r = await runOnce();
    if (!r.ok) {
      cache = { ok: false, gpuPct: null, engines: null, ts: Date.now(), error: r.error };
      return cache;
    }
    const byEngine = parseCounterCsv(r.text, ownPids());
    const st = byEngine.__stat || { totalLines: 0, matched: 0, kept: 0 };
    if (st.matched === 0) {
      /* 一行都没认出来 —— 这是【解析失败】，不是"本进程没用 GPU"。
         两者必须分开报，否则你会在本机明明有 GPU 负载时看到一句
         「未匹配到本进程的 GPU 引擎实例」，然后得出错误结论。
         2026-10-04 就是这么绕了一圈：真实输出是 `名=值`，
         正则却按 `名,值` 写，647 行全被丢掉。 */
      cache = { ok: false, gpuPct: null, engines: null, ts: Date.now(),
                error: '无法解析计数器输出（认到 0 / ' + st.totalLines + ' 行）',
                parse: st };
      return cache;
    }
    if (byEngine.size === 0) {
      // 认出了 st.matched 行，但本进程一个正的 GPU 引擎值都没有。
      // 这【不是错误】：绝大多数情况就是"本进程当前确实没在用 GPU"
      // （例如没硬件加速、或窗口最小化没绘制）。
      // 语义上它应该等于 0，但"真的是 0"和"计数器里查无此进程"在
      // 这个接口上无法区分，所以仍返回 null，UI 显示 --。
      cache = { ok: true, gpuPct: 0, totalPct: 0, engines: {}, ts: Date.now(),
                error: null, note: '本进程当前无 GPU 负载（读到 ' + st.matched + ' 个实例）',
                parse: st };
      return cache;
    }
    // 3D 是最主要的图形负载；把 3D 单独作为主指标，
    // 另有 Copy/VideoDecode 等。UI 主栏显示 3D（与任务管理器"3D"同名同义）。
    const threeD = byEngine.get('3d') || 0;
    const total = [...byEngine.values()].reduce((a, b) => a + b, 0);
    const engines = {};
    for (const [k, v] of byEngine) engines[k] = +v.toFixed(2);
    cache = {
      ok: true,
      gpuPct: +Math.min(100, threeD).toFixed(1),   // 主指标：3D
      totalPct: +Math.min(100, total).toFixed(1),
      engines,
      ts: Date.now(),
      error: null,
      note: null,
      parse: st,
    };
    return cache;
  } catch (e) {
    cache = { ok: false, gpuPct: null, engines: null, ts: Date.now(), error: String((e && e.message) || e) };
    return cache;
  } finally {
    running = false;
  }
}

function startGpuPerf(intervalMs) {
  if (timer) return;                       // 幂等
  const iv = Number(intervalMs) > 0 ? Number(intervalMs) : DEFAULT_INTERVAL;
  sampleOnce();                            // 立刻采一次，别等第一个周期
  timer = setInterval(sampleOnce, iv);
  if (timer.unref) timer.unref();          // 别因为这个定时器挡住进程退出
}

function stopGpuPerf() {
  if (timer) { clearInterval(timer); timer = null; }
}

/** 同步取缓存值，不阻塞。UI 读这个。 */
function getGpuPerf() {
  return {
    ok: cache.ok,
    gpuPct: cache.ok ? cache.gpuPct : null,
    totalPct: cache.ok ? (cache.totalPct != null ? cache.totalPct : null) : null,
    engines: cache.engines || null,
    ts: cache.ts,
    ageMs: cache.ts ? Date.now() - cache.ts : -1,
    intervalMs: DEFAULT_INTERVAL,
    error: cache.error || null,
    note: cache.note || null,       // 非错误的人类可读说明（如"当前无 GPU 负载"）
    parse: cache.parse || null,     // 诊断：认到几行 / 留了几条
  };
}

module.exports = { startGpuPerf, stopGpuPerf, getGpuPerf, setAppPids, sampleOnce, parseCounterCsv };
