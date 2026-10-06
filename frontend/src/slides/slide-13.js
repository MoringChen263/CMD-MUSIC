window.slideDataMap.set(13, `
<div class="w-[1440px] h-[810px] shadow-2xl relative overflow-hidden slide-bg" style="font-family:'Noto Sans SC',sans-serif;">
  <div class="absolute inset-0" style="background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px);"></div>
  <div class="relative z-10 w-full h-full flex flex-col px-[70px] py-[44px]">
    <div class="flex items-center gap-3 mb-4">
      <div class="w-9 h-9 bg-cyan-500 flex items-center justify-center text-slate-900 font-mono font-bold rounded">13</div>
      <h2 class="text-[34px] font-bold text-cyan-300 font-mono">成功标准与风险边界</h2>
    </div>
    <div class="grid grid-cols-2 gap-6 flex-1">
      <div class="flex flex-col">
        <div class="text-green-300 font-mono text-[15px] font-bold mb-3">✓ 成功标准（可衡量）</div>
        <div class="flex flex-col gap-2.5">
          <div class="bg-slate-800/70 border border-green-500/30 rounded px-4 py-2.5 text-slate-200 text-[14px]"><span class="text-green-400 font-mono">功能</span> 选文件夹后 3 步内出声</div>
          <div class="bg-slate-800/70 border border-green-500/30 rounded px-4 py-2.5 text-slate-200 text-[14px]"><span class="text-green-400 font-mono">稳定</span> 壁纸态崩溃率 &lt; 1%（Win10/11 主屏）</div>
          <div class="bg-slate-800/70 border border-green-500/30 rounded px-4 py-2.5 text-slate-200 text-[14px]"><span class="text-green-400 font-mono">性能</span> 壁纸态 CPU &lt; 3%，帧率 ≤ 30fps 可控</div>
          <div class="bg-slate-800/70 border border-green-500/30 rounded px-4 py-2.5 text-slate-200 text-[14px]"><span class="text-green-400 font-mono">视觉</span> 9 区布局 / 深蓝 / 等宽 / 直角细线 对齐设计稿</div>
        </div>
      </div>
      <div class="flex flex-col">
        <div class="text-amber-300 font-mono text-[15px] font-bold mb-3">⚠ 风险与应对</div>
        <div class="bg-slate-900/70 border border-amber-500/20 rounded-lg overflow-hidden">
          <div class="grid grid-cols-12 text-[13px] font-mono bg-slate-800/80"><div class="col-span-6 p-2.5 text-slate-400">风险</div><div class="col-span-2 p-2.5 text-amber-300">等级</div><div class="col-span-4 p-2.5 text-slate-400">应对</div></div>
          <div class="grid grid-cols-12 text-[13px] border-t border-slate-700/50"><div class="col-span-6 p-2.5 text-slate-200">父窗口兼容性</div><div class="col-span-2 p-2.5 text-red-400">高</div><div class="col-span-4 p-2.5 text-slate-300">早期 spike + 降级层</div></div>
          <div class="grid grid-cols-12 text-[13px] border-t border-slate-700/50 bg-slate-800/40"><div class="col-span-6 p-2.5 text-slate-200">原生模块打包</div><div class="col-span-2 p-2.5 text-amber-400">中</div><div class="col-span-4 p-2.5 text-slate-300">独立 addon + CI</div></div>
          <div class="grid grid-cols-12 text-[13px] border-t border-slate-700/50"><div class="col-span-6 p-2.5 text-slate-200">电耗 / 常驻</div><div class="col-span-2 p-2.5 text-amber-400">中</div><div class="col-span-4 p-2.5 text-slate-300">空闲降帧 / 暂停停分析</div></div>
          <div class="grid grid-cols-12 text-[13px] border-t border-slate-700/50 bg-slate-800/40"><div class="col-span-6 p-2.5 text-slate-200">多屏 / 高 DPI</div><div class="col-span-2 p-2.5 text-amber-400">中</div><div class="col-span-4 p-2.5 text-slate-300">原型期限主屏</div></div>
          <div class="grid grid-cols-12 text-[13px] border-t border-slate-700/50"><div class="col-span-6 p-2.5 text-slate-200">歌词/元数据缺失</div><div class="col-span-2 p-2.5 text-green-400">低</div><div class="col-span-4 p-2.5 text-slate-300">优雅降级显示</div></div>
        </div>
      </div>
    </div>
  </div>
</div>
`);
