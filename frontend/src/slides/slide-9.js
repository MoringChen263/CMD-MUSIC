window.slideDataMap.set(9, `
<div class="w-[1440px] h-[810px] shadow-2xl relative overflow-hidden slide-bg" style="font-family:'Noto Sans SC',sans-serif;">
  <div class="absolute inset-0" style="background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px);"></div>
  <div class="relative z-10 w-full h-full flex flex-col px-[70px] py-[44px]">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-9 h-9 bg-cyan-500 flex items-center justify-center text-slate-900 font-mono font-bold rounded">09</div>
      <h2 class="text-[34px] font-bold text-cyan-300 font-mono">视觉稳定性：反抖动约束</h2>
    </div>
    <div class="bg-red-900/30 border border-red-500/40 rounded-lg p-4 mb-5">
      <div class="text-red-300 font-mono text-[15px] font-bold mb-1">⚠ PROBLEM · 预览中频谱/进度条抖动</div>
      <p class="text-slate-300 text-[14px]">根因：方块字符字体度量不一致导致整列偏移 · 每帧重写文本 DOM 触发重排 · 进度条用 width% 阶梯更新一格格跳。</p>
    </div>
    <div class="grid grid-cols-2 gap-5 flex-1">
      <div class="bg-slate-800/70 border-l-4 border-cyan-400 rounded-r-lg p-4"><div class="text-cyan-300 font-mono text-[16px] font-bold">① Spectrum / Waveform</div><p class="text-slate-300 text-[14px] mt-1">必须用 Canvas 固定格子绘制（整数像素），不依赖字体；禁止每帧重写文本 DOM。</p></div>
      <div class="bg-slate-800/70 border-l-4 border-green-400 rounded-r-lg p-4"><div class="text-green-300 font-mono text-[16px] font-bold">② 进度条</div><p class="text-slate-300 text-[14px] mt-1">用 rAF 紧跟 currentTime；填充 transform: scaleX()，滑块 translateX()——GPU 位移，不触发布局抖动。</p></div>
      <div class="bg-slate-800/70 border-l-4 border-amber-400 rounded-r-lg p-4"><div class="text-amber-300 font-mono text-[16px] font-bold">③ 动态文本</div><p class="text-slate-300 text-[14px] mt-1">时间 / CPU/GPU 数值放在固定宽度容器内，避免数值变化导致整行位移。</p></div>
      <div class="bg-slate-800/70 border-l-4 border-purple-400 rounded-r-lg p-4"><div class="text-purple-300 font-mono text-[16px] font-bold">④ 性能</div><p class="text-slate-300 text-[14px] mt-1">壁纸态可视化帧率 ≤ 30fps；暂停 / 空闲时进一步降频或停重绘，降低功耗。</p></div>
    </div>
  </div>
</div>
`);
