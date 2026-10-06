window.slideDataMap.set(7, `
<div class="w-[1440px] h-[810px] shadow-2xl relative overflow-hidden slide-bg" style="font-family:'Noto Sans SC',sans-serif;">
  <div class="absolute inset-0" style="background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px);"></div>
  <div class="relative z-10 w-full h-full flex flex-col px-[70px] py-[44px]">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-9 h-9 bg-cyan-500 flex items-center justify-center text-slate-900 font-mono font-bold rounded">07</div>
      <h2 class="text-[34px] font-bold text-cyan-300 font-mono">壁纸模式：Windows 父窗口</h2>
    </div>
    <div class="text-slate-400 text-[15px] mb-8 font-mono">最大难点 · 让窗口"长在桌面背景上，不遮挡应用"</div>
    <div class="flex items-stretch justify-between gap-2 mb-8">
      <div class="flex-1 bg-slate-800/70 border border-cyan-500/30 rounded-lg p-4 text-center"><div class="text-cyan-400 font-mono text-[13px]">STEP 1</div><div class="text-slate-100 text-[16px] font-semibold mt-1">explorer</div><div class="text-slate-400 text-[12px] mt-1">桌面由 explorer 管理</div></div>
      <div class="flex items-center text-cyan-400 text-[28px] font-mono">→</div>
      <div class="flex-1 bg-slate-800/70 border border-cyan-500/30 rounded-lg p-4 text-center"><div class="text-cyan-400 font-mono text-[13px]">STEP 2</div><div class="text-slate-100 text-[16px] font-semibold mt-1">SPAWN_WORKER</div><div class="text-slate-400 text-[12px] mt-1">发 0x052C 强制生成两个 WorkerW</div></div>
      <div class="flex items-center text-cyan-400 text-[28px] font-mono">→</div>
      <div class="flex-1 bg-slate-800/70 border border-green-500/30 rounded-lg p-4 text-center"><div class="text-green-400 font-mono text-[13px]">STEP 3</div><div class="text-slate-100 text-[16px] font-semibold mt-1">找空 WorkerW</div><div class="text-slate-400 text-[12px] mt-1">枚举不带 DefView 的承载层</div></div>
      <div class="flex items-center text-cyan-400 text-[28px] font-mono">→</div>
      <div class="flex-1 bg-slate-800/70 border border-amber-500/30 rounded-lg p-4 text-center"><div class="text-amber-400 font-mono text-[13px]">STEP 4</div><div class="text-slate-100 text-[16px] font-semibold mt-1">SetParent</div><div class="text-slate-400 text-[12px] mt-1">父化到空 WorkerW</div></div>
      <div class="flex items-center text-cyan-400 text-[28px] font-mono">→</div>
      <div class="flex-1 bg-gradient-to-br from-green-600/30 to-emerald-600/20 border border-green-400 rounded-lg p-4 text-center"><div class="text-green-300 font-mono text-[13px]">RESULT</div><div class="text-white text-[16px] font-bold mt-1">HWND_BOTTOM</div><div class="text-green-200 text-[12px] mt-1">成为桌面背景</div></div>
    </div>
    <div class="bg-slate-900/70 border-l-4 border-cyan-400 rounded-r-lg p-5">
      <p class="text-slate-200 text-[16px] leading-relaxed">结果：播放器成为桌面背景层，<span class="text-cyan-300 font-semibold">图标和所有普通窗口都浮在它上面，完全不遮挡应用</span>。窗口模式则还原到桌面根（SetParent NULL）+ 正常浮动，二者一键互转。</p>
    </div>
  </div>
</div>
`);
