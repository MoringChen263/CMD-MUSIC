window.slideDataMap.set(10, `
<div class="w-[1440px] h-[810px] shadow-2xl relative overflow-hidden slide-bg" style="font-family:'Noto Sans SC',sans-serif;">
  <div class="absolute inset-0" style="background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px);"></div>
  <div class="relative z-10 w-full h-full flex flex-col px-[70px] py-[44px]">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-9 h-9 bg-cyan-500 flex items-center justify-center text-slate-900 font-mono font-bold rounded">10</div>
      <h2 class="text-[34px] font-bold text-cyan-300 font-mono">主题与背景自定义</h2>
    </div>
    <div class="flex gap-6 flex-1">
      <div class="w-[40%] flex flex-col gap-4">
        <div class="text-slate-300 text-[15px] font-semibold">可调设置项</div>
        <div class="flex flex-wrap gap-2">
          <span class="px-3 py-1.5 bg-slate-800/70 border border-cyan-500/30 rounded-full text-cyan-300 font-mono text-[13px]">背景色</span>
          <span class="px-3 py-1.5 bg-slate-800/70 border border-cyan-500/30 rounded-full text-cyan-300 font-mono text-[13px]">前景色</span>
          <span class="px-3 py-1.5 bg-slate-800/70 border border-cyan-500/30 rounded-full text-cyan-300 font-mono text-[13px]">强调色</span>
          <span class="px-3 py-1.5 bg-slate-800/70 border border-cyan-500/30 rounded-full text-cyan-300 font-mono text-[13px]">背景透明度</span>
          <span class="px-3 py-1.5 bg-slate-800/70 border border-cyan-500/30 rounded-full text-cyan-300 font-mono text-[13px]">面板边框色</span>
        </div>
        <div class="bg-slate-900/70 border border-cyan-500/20 rounded-lg p-4 mt-2">
          <div class="text-cyan-300 font-mono text-[14px] font-bold mb-1">持久化</div>
          <p class="text-slate-300 text-[14px] leading-snug">配置写入 <span class="font-mono text-amber-300">settings.json</span>（userData 目录），启动读取并写入 CSS 变量，主题切换零重启。</p>
          <p class="text-slate-400 text-[13px] mt-2 font-mono">// 透明度=用户原桌面壁纸的可见程度（0 全透 / 1 纯 CMD 蓝）</p>
        </div>
      </div>
      <div class="flex-1 flex flex-col">
        <div class="text-slate-300 text-[15px] font-semibold mb-3">预设主题</div>
        <div class="grid grid-cols-2 gap-4 flex-1">
          <div class="bg-slate-800/70 border border-cyan-500/30 rounded-lg p-4 flex items-center gap-3"><div class="w-10 h-10 rounded bg-[#0000aa] border border-white/20"></div><div><div class="text-slate-100 text-[15px] font-semibold">经典 CMD</div><div class="text-slate-400 text-[12px] font-mono">#0000AA 深蓝</div></div></div>
          <div class="bg-slate-800/70 border border-cyan-500/30 rounded-lg p-4 flex items-center gap-3"><div class="w-10 h-10 rounded bg-[#0c0c0c] border border-white/20"></div><div><div class="text-slate-100 text-[15px] font-semibold">黑终端</div><div class="text-slate-400 text-[12px] font-mono">#0C0C0C</div></div></div>
          <div class="bg-slate-800/70 border border-cyan-500/30 rounded-lg p-4 flex items-center gap-3"><div class="w-10 h-10 rounded bg-[#001100] border border-white/20"></div><div><div class="text-slate-100 text-[15px] font-semibold">绿磷光</div><div class="text-slate-400 text-[12px] font-mono">#001100 绿</div></div></div>
          <div class="bg-slate-800/70 border border-cyan-500/30 rounded-lg p-4 flex items-center gap-3"><div class="w-10 h-10 rounded bg-[#1a1200] border border-white/20"></div><div><div class="text-slate-100 text-[15px] font-semibold">琥珀</div><div class="text-slate-400 text-[12px] font-mono">#1A1200 橙</div></div></div>
          <div class="bg-slate-800/70 border border-cyan-500/30 rounded-lg p-4 flex items-center gap-3 col-span-2"><div class="w-10 h-10 rounded" style="background:rgba(0,0,170,0.45);border:1px solid rgba(255,255,255,.2)"></div><div><div class="text-slate-100 text-[15px] font-semibold">透明蓝（Glass）</div><div class="text-slate-400 text-[12px] font-mono">低不透明度，露出原桌面</div></div></div>
        </div>
      </div>
    </div>
  </div>
</div>
`);
