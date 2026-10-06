window.slideDataMap.set(8, `
<div class="w-[1440px] h-[810px] shadow-2xl relative overflow-hidden slide-bg" style="font-family:'Noto Sans SC',sans-serif;">
  <div class="absolute inset-0" style="background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px);"></div>
  <div class="relative z-10 w-full h-full flex flex-col px-[70px] py-[40px]">
    <div class="flex items-center gap-3 mb-4">
      <div class="w-9 h-9 bg-cyan-500 flex items-center justify-center text-slate-900 font-mono font-bold rounded">08</div>
      <h2 class="text-[34px] font-bold text-cyan-300 font-mono">交互：壁纸 ↔ 窗口 双模式</h2>
    </div>
    <div class="grid grid-cols-2 gap-6 flex-1">
      <div class="flex flex-col">
        <div class="text-cyan-300 font-mono text-[15px] font-bold mb-3">全局快捷键（不依赖鼠标点背景）</div>
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center gap-3 bg-slate-800/70 border border-cyan-500/20 rounded px-4 py-2.5"><span class="font-mono text-amber-300 text-[15px] w-[120px]">Ctrl+Alt+W</span><span class="text-slate-200 text-[15px]">壁纸 ↔ 窗口 一键切换</span></div>
          <div class="flex items-center gap-3 bg-slate-800/70 border border-cyan-500/20 rounded px-4 py-2.5"><span class="font-mono text-amber-300 text-[15px] w-[120px]">Space</span><span class="text-slate-200 text-[15px]">播放 / 暂停</span></div>
          <div class="flex items-center gap-3 bg-slate-800/70 border border-cyan-500/20 rounded px-4 py-2.5"><span class="font-mono text-amber-300 text-[15px] w-[120px]">N / P</span><span class="text-slate-200 text-[15px]">上一首 / 下一首</span></div>
          <div class="flex items-center gap-3 bg-slate-800/70 border border-cyan-500/20 rounded px-4 py-2.5"><span class="font-mono text-amber-300 text-[15px] w-[120px]">Ctrl+Alt+C</span><span class="text-slate-200 text-[15px]">召唤命令面板</span></div>
          <div class="flex items-center gap-3 bg-slate-800/70 border border-cyan-500/20 rounded px-4 py-2.5"><span class="font-mono text-amber-300 text-[15px] w-[120px]">Ctrl+Alt+V</span><span class="text-slate-200 text-[15px]">音量调节</span></div>
        </div>
      </div>
      <div class="flex flex-col">
        <div class="text-cyan-300 font-mono text-[15px] font-bold mb-3">壁纸模式 vs 窗口模式</div>
        <div class="bg-slate-900/70 border border-cyan-500/20 rounded-lg overflow-hidden">
          <div class="grid grid-cols-3 text-[14px] font-mono bg-slate-800/80"><div class="p-2.5 text-slate-400">维度</div><div class="p-2.5 text-cyan-300">壁纸模式</div><div class="p-2.5 text-green-300">窗口模式</div></div>
          <div class="grid grid-cols-3 text-[14px] border-t border-slate-700/50"><div class="p-2.5 text-slate-400">父窗口</div><div class="p-2.5 text-slate-200">WorkerW 空层</div><div class="p-2.5 text-slate-200">桌面根</div></div>
          <div class="grid grid-cols-3 text-[14px] border-t border-slate-700/50 bg-slate-800/40"><div class="p-2.5 text-slate-400">层级</div><div class="p-2.5 text-slate-200">alwaysOnBottom</div><div class="p-2.5 text-slate-200">正常浮动</div></div>
          <div class="grid grid-cols-3 text-[14px] border-t border-slate-700/50"><div class="p-2.5 text-slate-400">任务栏</div><div class="p-2.5 text-slate-200">不占</div><div class="p-2.5 text-slate-200">正常显示</div></div>
          <div class="grid grid-cols-3 text-[14px] border-t border-slate-700/50 bg-slate-800/40"><div class="p-2.5 text-slate-400">鼠标交互</div><div class="p-2.5 text-slate-200">不可点</div><div class="p-2.5 text-slate-200">正常点击</div></div>
        </div>
        <div class="text-slate-400 text-[13px] font-mono mt-3">// 价值：壁纸态零干扰欣赏可视化；窗口态用鼠标顺畅操作命令与列表</div>
      </div>
    </div>
  </div>
</div>
`);
