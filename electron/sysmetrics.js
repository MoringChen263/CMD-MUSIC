/* ============================================================
   sysmetrics.js — 真实系统指标采样（替换原先 renderer 里的假随机数）

   背景：
     之前 UI 上的 CPU / GPU / RAM 三条指标是 simStats() 里的随机数游走，
     每帧（每秒 165 次）刷新，既浪费又是在骗人。这个模块提供真实测量。

   采样算法（全部来自 Node 内置 os 模块，无第三方依赖）：
     CPU —— 必须用【两次采样的差值】，不能用瞬时值。
            os.cpus()[i].times = { user, nice, sys, idle, irq }，单位是毫秒累计值；
            把所有核心的 idle 与 total 分别求和，再算增量：
                dIdle  = idle  - prev.idle
                dTotal = total - prev.total
                负载%  = (1 - dIdle / dTotal) * 100
            先求和后相除 = 多核【平均】负载（不是单核负载，也不是总和）。
            idle 不计入负载。第一次调用没有 prev，只能记基准，负载恒为 0。
     RAM —— (1 - freemem / totalmem) * 100，物理内存占用率。
            另外给出本进程自身的 rss（常驻集，MB）/ heapUsed（MB），
            对播放器这类常驻小工具，"我自己吃了多少内存"比系统总量更有参考价值。

   为什么 GPU 【不给百分比】：
     Node / Electron 没有任何跨平台 API 能读到 GPU 实时占用率。
     Windows 上要拿到 NVML / D3DKMT 计数器需要额外的原生模块和权限，
     而本项目要求零原生依赖（wallpaper.js 已经全部走 PowerShell + user32 P/Invoke，
     不能再引 .node）。所以任何"GPU 使用率 37%"的数字都只能是编的。

     替代方案：显示【真实的 GPU 加速能力状态】。这对本项目尤其重要——
     壁纸模式把窗口挂进了 Windows 桌面 WorkerW 层，壁纸态卡顿最常见的原因
     就是硬件加速没生效、被降级成软件渲染（SwiftShader）。此时
     CPU 占用飙高而"GPU 正常"会误导排查，真实状态一眼就能看出来。

     数据源：Electron 的 app.getGPUFeatureStatus()（主进程 API，实测 Electron 31.7.7
     上是【同步】方法，不是 Promise，也没有废弃）。
     ⚠️ 实测坑：它的返回值【不是】文档里写的 'enabled' / 'disabled' / 'software'，
     而是带后缀的复合字符串，需要解析第一个状态段，例如：
         "gpu_compositing": "disabled_software"   ← 软件渲染回退
         "rasterization":  "disabled_software"
         "multiple_raster_threads": "enabled_on"  ← 硬件路径可用
     所以本模块按"段"解析：任一段为 software → SW，含 enabled → HW，否则 OFF。
     app.getGPUInfo() 在本机实测返回空对象（无独显的虚拟机环境），
     且签名需要 'basic'/'complete' 参数，稳定性差，不作为主数据源，仅在需要排查时用。

   使用约定：
     本项目窗口开了 contextIsolation: true，渲染进程【拿不到】本模块。
     必须由主进程在自己的进程里调用，再通过 IPC 推给渲染层。
     建议在 app.whenReady() 之后启动定时器（ready 前 os.cpus() 可用，
     但 getGPUFeatureStatus() 未 ready 时会抛异常，本模块内部已兜底成 UNKNOWN）。
     采样间隔建议 >= 500ms：os.cpus() 每次都要读全核 times，太密没有额外信息量，
     只是白白增加主进程开销。

   导出：
     sampleMetrics(firstCall) -> 真实指标对象（第一次只建基准，负载为 0）
     gpuStatus()              -> { gpu, gpuDetail }，gpu 为 'HW' | 'SW' | 'OFF' | 'UNKNOWN'
   ============================================================ */
'use strict';

const os = require('os');

// electron 只在主进程可用；本模块也可能被纯 Node 环境（node --check / 单元测试）加载，
// 所以用 try 包起来，不要让 require 本身炸掉。
let electronApp = null;
try {
  // eslint-disable-next-line global-require
  electronApp = require('electron').app || null;
} catch (_) {
  electronApp = null; // 纯 Node 环境（没有 electron 依赖），GPU 状态一律 UNKNOWN
}

// ------------------------------------------------------------------ 工具

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

// ------------------------------------------------------------------ CPU 基准

// 上一次采样的累计值（毫秒）。null 表示还没建立基准。
let prevCpu = null;

/**
 * 读一次 os.cpus() 的累计值并求和。
 * 先把所有核心的 idle / total 分别相加，之后再算增量比例 ——
 * 这样得到的是多核平均负载，而不是单核负载。
 */
function readCpuTotals() {
  let idle = 0;
  let total = 0;
  const list = os.cpus() || [];
  for (const c of list) {
    const t = c && c.times;
    if (!t) continue;
    idle += t.idle;
    // irq 计入 total（它确实消耗了 CPU 时间），但和 idle 一样不算"忙"
    total += t.user + t.nice + t.sys + t.irq + t.idle;
  }
  return { idle, total, cores: list.length };
}

// ------------------------------------------------------------------ GPU 状态

// GPU 能力在进程生命周期内不会变（除非用户改启动参数重启），所以缓存起来，
// 避免每 500ms 都去问一遍。缓存 60s 兜底，便于运行中降级也能被发现。
let gpuCache = null;
let gpuCacheAt = 0;
const GPU_CACHE_TTL = 60000;

// 判定"加速是否正常"要看的关键特性：这几个直接决定频谱动画 / 视频 / 壁纸合成
// 能不能走硬件路径。'vulkan' / 'webgpu' / 'skia_graphite' 属于可选新特性，
// 缺失不代表卡顿，不参与判定。
const KEY_FEATURES = ['gpu_compositing', 'rasterization', 'video_decode', 'webgl', 'webgl2'];

/**
 * 解析 getGPUFeatureStatus() 的值。
 * 实测（Electron 31.7.7）返回值形如 'enabled_on' / 'disabled_off' /
 * 'disabled_software' / 'disabled_off_ok'，所以按 '_' 分段判断：
 *   含 'software' 段 → 走了软件渲染（SwiftShader / WARP）
 *   含 'enabled' 段  → 硬件路径可用
 *   其它             → 不可用
 */
function parseFeatureState(raw) {
  const s = String(raw == null ? '' : raw).toLowerCase();
  const parts = s.split('_');
  if (parts.indexOf('software') !== -1) return 'software';
  if (parts.indexOf('emulated') !== -1) return 'software';
  if (parts.indexOf('enabled') !== -1) return 'enabled';
  return 'disabled';
}

/**
 * 返回真实 GPU 加速状态。
 * @returns {{gpu: string, gpuDetail: string, gpuRaw: object}}
 *   gpu       —— 'HW' 硬件加速正常 / 'SW' 降级为软件渲染 / 'OFF' 关键特性被关 / 'UNKNOWN' 拿不到
 *   gpuDetail —— 关键特征的 "名=状态" 串，排障用
 *   gpuRaw     —— 完整原始对象
 */
function gpuStatus() {
  if (!electronApp || typeof electronApp.getGPUFeatureStatus !== 'function') {
    return {
      gpu: 'UNKNOWN',
      gpuDetail: 'getGPUFeatureStatus unavailable',
      gpuRaw: {},
    };
  }

  const now = Date.now();
  if (gpuCache && now - gpuCacheAt < GPU_CACHE_TTL) return gpuCache;

  let raw = null;
  try {
    // app ready 之前调用会抛异常，这里兜底
    raw = electronApp.getGPUFeatureStatus();
  } catch (e) {
    return {
      gpu: 'UNKNOWN',
      gpuDetail: 'getGPUFeatureStatus error: ' + (e && e.message ? e.message : String(e)),
      gpuRaw: {},
    };
  }
  if (!raw || typeof raw !== 'object') {
    return { gpu: 'UNKNOWN', gpuDetail: 'empty feature status', gpuRaw: {} };
  }

  // 逐个关键特性归一化成 enabled / software / disabled
  const states = {};
  for (const k of KEY_FEATURES) {
    if (k in raw) states[k] = parseFeatureState(raw[k]);
  }

  // 判定顺序：全 enabled → HW；出现 software → SW；其余（有真被关的）→ OFF。
  // SW 优先于 OFF，因为"降级但还能跑"比"直接关掉"更贴近壁纸卡顿的真实成因。
  const keys = Object.keys(states);
  let gpu;
  if (keys.length && keys.every((k) => states[k] === 'enabled')) {
    gpu = 'HW';
  } else if (keys.some((k) => states[k] === 'software')) {
    gpu = 'SW';
  } else if (keys.some((k) => states[k] === 'disabled')) {
    gpu = 'OFF';
  } else {
    gpu = 'UNKNOWN';
  }

  const detail = keys.map((k) => k + '=' + states[k]).join(' ');
  gpuCache = { gpu, gpuDetail: detail, gpuRaw: raw };
  gpuCacheAt = now;
  return gpuCache;
}

// ------------------------------------------------------------------ 对外接口

/**
 * 采样一次系统指标。
 * @param {boolean} firstCall true = 本进程内第一次调用，只建立 CPU 基准并返回 cpuPct 0
 * @returns {{cpuPct:number, ramPct:number, rssMB:number, heapMB:number,
 *            ramTotalGB:number, cores:number, ts:number, warmup:boolean}}
 */
function sampleMetrics(firstCall) {
  const cur = readCpuTotals();

  let cpuPct = 0;
  const warmup = !prevCpu;

  if (prevCpu && cur.total >= prevCpu.total && cur.idle >= prevCpu.idle) {
    // 正常路径：增量比例
    const dIdle = cur.idle - prevCpu.idle;
    const dTotal = cur.total - prevCpu.total;
    if (dTotal > 0) cpuPct = (1 - dIdle / dTotal) * 100;
    // dTotal === 0 说明两次采样落在同一毫秒内（采样过密），保持 0 而不是 NaN
  } else if (prevCpu) {
    // 计数器回退/重置（理论上不会发生，Windows 偶发），放弃这一帧的负载，
    // 重新以当前值为基准，避免下一帧算出负数或天文数字。
    cpuPct = 0;
  }
  // firstCall（无 prev）：只建基准，cpuPct 保持 0

  // 无论上面走哪条路径，本次的累计值都成为下一次比较的基准
  prevCpu = cur;

  const total = os.totalmem();
  const free = os.freemem();
  // total/free 理论上恒 > 0，仍做一次除零保护（osmock/异常环境下可能为 0）
  const ramPct = total > 0 ? (1 - free / total) * 100 : 0;

  const mu = process.memoryUsage();
  const MB = 1024 * 1024;

  return {
    // Windows 上偶发超出 0~100，统一 clamp
    cpuPct: clamp(cpuPct, 0, 100),
    ramPct: clamp(ramPct, 0, 100),
    rssMB: Math.round(mu.rss / MB * 10) / 10,
    heapMB: Math.round(mu.heapUsed / MB * 10) / 10,
    ramTotalGB: Math.round(total / 1024 / 1024 / 1024 * 10) / 10,
    cores: cur.cores,
    ts: Date.now(),
    // warmup=true 表示这一帧的 cpuPct 是"没基准"填的 0，不是真的空闲
    warmup: warmup || !!firstCall,
  };
}

module.exports = { sampleMetrics, gpuStatus };
