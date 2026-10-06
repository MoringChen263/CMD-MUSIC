window.slideDataMap.set(5, `
<div class="w-[1440px] h-[810px] shadow-2xl relative overflow-hidden slide-bg" style="font-family:'Noto Sans SC',sans-serif;">
  <div class="absolute inset-0" style="background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px);"></div>
  <div class="relative z-10 w-full h-full flex flex-col px-[70px] py-[40px]">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-9 h-9 bg-cyan-500 flex items-center justify-center text-slate-900 font-mono font-bold rounded">05</div>
      <h2 class="text-[34px] font-bold text-cyan-300 font-mono">信息架构：9 区布局</h2>
    </div>
    <div class="text-slate-400 text-[15px] mb-5 font-mono">主区(左) + 侧栏(右) · 清晰信息层级</div>
    <div class="grid grid-cols-3 grid-rows-3 gap-4 flex-1">
      <div class="bg-slate-800/60 border border-cyan-500/20 rounded-lg p-4"><div class="text-cyan-400 font-mono text-[13px]">HEADER</div><div class="text-slate-100 text-[16px] font-semibold mt-1">顶部状态条</div><div class="text-slate-400 text-[12px] mt-1">FPS / CPU / GPU</div></div>
      <div class="bg-slate-800/60 border border-cyan-500/20 rounded-lg p-4"><div class="text-cyan-400 font-mono text-[13px]">LYRICS</div><div class="text-slate-100 text-[16px] font-semibold mt-1">歌词 + 终端日志</div><div class="text-slate-400 text-[12px] mt-1">reply from 127.0.0.1</div></div>
      <div class="bg-slate-800/60 border border-cyan-500/20 rounded-lg p-4"><div class="text-cyan-400 font-mono text-[13px]">AUDIO</div><div class="text-slate-100 text-[16px] font-semibold mt-1">音频 / 系统参数</div><div class="text-slate-400 text-[12px] mt-1">ffprobe 式面板</div></div>
      <div class="bg-slate-800/60 border border-cyan-500/20 rounded-lg p-4"><div class="text-cyan-400 font-mono text-[13px]">SPECTRUM</div><div class="text-slate-100 text-[16px] font-semibold mt-1">频谱可视化</div><div class="text-slate-400 text-[12px] mt-1">频段柱</div></div>
      <div class="bg-gradient-to-br from-cyan-600/40 to-blue-600/30 border-2 border-cyan-400 rounded-lg p-4 flex flex-col justify-center"><div class="text-cyan-300 font-mono text-[14px]">▸ PLAYER</div><div class="text-white text-[18px] font-bold mt-1">当前播放（核心）</div><div class="text-cyan-200 text-[12px] mt-1">歌名 &gt; 状态 &gt; 参数</div></div>
      <div class="bg-slate-800/60 border border-cyan-500/20 rounded-lg p-4"><div class="text-cyan-400 font-mono text-[13px]">PLAYLIST</div><div class="text-slate-100 text-[16px] font-semibold mt-1">播放列表</div><div class="text-slate-400 text-[12px] mt-1">▶ 当前 / LOOP / SHUFFLE</div></div>
      <div class="bg-slate-800/60 border border-cyan-500/20 rounded-lg p-4"><div class="text-cyan-400 font-mono text-[13px]">COMMAND</div><div class="text-slate-100 text-[16px] font-semibold mt-1">命令输入</div><div class="text-slate-400 text-[12px] mt-1">↑↓ 历史</div></div>
      <div class="bg-slate-800/60 border border-cyan-500/20 rounded-lg p-4"><div class="text-cyan-400 font-mono text-[13px]">PROGRESS</div><div class="text-slate-100 text-[16px] font-semibold mt-1">底部进度</div><div class="text-slate-400 text-[12px] mt-1">时间 / 格式 / 快捷键</div></div>
      <div class="bg-slate-900/70 border border-amber-500/30 rounded-lg p-4"><div class="text-amber-400 font-mono text-[13px]">PRIORITY</div><div class="text-slate-200 text-[13px] mt-1 leading-snug">一级核心 → 二级常用 → 三级增强 → 四级技术</div></div>
    </div>
  </div>
</div>
`);
