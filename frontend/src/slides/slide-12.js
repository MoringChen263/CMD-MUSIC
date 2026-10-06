window.slideDataMap.set(12, `
<div class="w-[1440px] h-[810px] shadow-2xl relative overflow-hidden slide-bg" style="font-family:'Noto Sans SC',sans-serif;">
  <div class="absolute inset-0" style="background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px);"></div>
  <div class="relative z-10 w-full h-full flex flex-col px-[70px] py-[44px]">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-9 h-9 bg-cyan-500 flex items-center justify-center text-slate-900 font-mono font-bold rounded">12</div>
      <h2 class="text-[34px] font-bold text-cyan-300 font-mono">分阶段路线图</h2>
    </div>
    <div class="text-slate-400 text-[15px] mb-6 font-mono">播放核心 → Command → Playlist → 可视化 → Debug</div>
    <div class="grid grid-cols-3 gap-6 flex-1">
      <div class="bg-slate-800/70 border-t-2 border-cyan-400 rounded-lg p-5 flex flex-col">
        <div class="text-cyan-300 font-mono text-[18px] font-bold mb-3">P0 · 基础</div>
        <div class="flex flex-col gap-3 text-[14px]">
          <div class="bg-slate-900/60 rounded p-3"><div class="text-slate-100 font-semibold">阶段0 骨架</div><div class="text-slate-400">9 区静态布局 · CSS 变量主题 · 反抖动约束</div><span class="text-cyan-400 font-mono text-[12px]">MUST</span></div>
          <div class="bg-slate-900/60 rounded p-3"><div class="text-slate-100 font-semibold">阶段1 播放核心</div><div class="text-slate-400">选文件夹→扫描→出声→进度联动</div><span class="text-cyan-400 font-mono text-[12px]">MUST</span></div>
        </div>
      </div>
      <div class="bg-slate-800/70 border-t-2 border-green-400 rounded-lg p-5 flex flex-col">
        <div class="text-green-300 font-mono text-[18px] font-bold mb-3">P1 · 形态</div>
        <div class="flex flex-col gap-3 text-[14px]">
          <div class="bg-slate-900/60 rounded p-3"><div class="text-slate-100 font-semibold">阶段2 壁纸模式</div><div class="text-slate-400">父窗口+快捷键+双模式切换</div><span class="text-green-400 font-mono text-[12px]">MUST</span></div>
          <div class="bg-slate-900/60 rounded p-3"><div class="text-slate-100 font-semibold">阶段3 Command+Playlist</div><div class="text-slate-400">命令解析 · ▶高亮 · LOOP/SHUFFLE</div><span class="text-amber-400 font-mono text-[12px]">SHOULD</span></div>
          <div class="bg-slate-900/60 rounded p-3"><div class="text-slate-100 font-semibold">阶段3b 主题自定义</div><div class="text-slate-400">调色板+预设+持久化</div><span class="text-amber-400 font-mono text-[12px]">SHOULD</span></div>
        </div>
      </div>
      <div class="bg-slate-800/70 border-t-2 border-amber-400 rounded-lg p-5 flex flex-col">
        <div class="text-amber-300 font-mono text-[18px] font-bold mb-3">P2 · 沉浸</div>
        <div class="flex flex-col gap-3 text-[14px]">
          <div class="bg-slate-900/60 rounded p-3"><div class="text-slate-100 font-semibold">阶段4 可视化</div><div class="text-slate-400">Spectrum+Waveform+Lyrics(.lrc)</div><span class="text-amber-400 font-mono text-[12px]">SHOULD</span></div>
          <div class="bg-slate-900/60 rounded p-3"><div class="text-slate-100 font-semibold">阶段5 Debug/System</div><div class="text-slate-400">参数+CPU/GPU/RAM+FPS</div><span class="text-purple-400 font-mono text-[12px]">COULD</span></div>
          <div class="bg-slate-900/60 rounded p-3 text-slate-400">范围外：在线流媒体 / 歌词联网 / EQ / 移动端</div>
        </div>
      </div>
    </div>
  </div>
</div>
`);
