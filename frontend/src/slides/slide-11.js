window.slideDataMap.set(11, `
<div class="w-[1440px] h-[810px] shadow-2xl relative overflow-hidden slide-bg" style="font-family:'Noto Sans SC',sans-serif;">
  <div class="absolute inset-0" style="background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px);"></div>
  <div class="relative z-10 w-full h-full flex flex-col px-[70px] py-[40px]">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-9 h-9 bg-cyan-500 flex items-center justify-center text-slate-900 font-mono font-bold rounded">11</div>
      <h2 class="text-[34px] font-bold text-cyan-300 font-mono">媒体库与导入（如何加歌）</h2>
    </div>
    <div class="flex gap-6 flex-1">
      <div class="w-[52%] bg-slate-900/90 rounded-lg overflow-hidden border border-green-500/30 shadow-2xl flex flex-col">
        <div class="bg-slate-800 border-b border-green-500/30 px-5 py-2.5 flex items-center justify-between">
          <div class="flex items-center gap-3"><div class="flex gap-2"><div class="w-3 h-3 bg-red-500 rounded-full"></div><div class="w-3 h-3 bg-yellow-500 rounded-full"></div><div class="w-3 h-3 bg-green-500 rounded-full"></div></div><span class="text-green-400 font-mono text-[14px] ml-3">cmd-music — import</span></div>
          <span class="text-green-400 font-mono text-[13px]">UTF-8 | CMD</span>
        </div>
        <div class="p-5 font-mono text-[15px] flex-1">
          <div><span class="text-slate-500">C:\\&gt;</span> <span class="text-cyan-400">load</span> <span class="text-green-300">D:\\Music</span>  <span class="text-slate-500">// 加载整个文件夹（递归）</span></div>
          <div><span class="text-slate-500">C:\\&gt;</span> <span class="text-cyan-400">add</span> <span class="text-green-300">song.flac</span>  <span class="text-slate-500">// 追加单曲</span></div>
          <div><span class="text-slate-500">C:\\&gt;</span> <span class="text-cyan-400">add</span> <span class="text-green-300">*.mp3</span>     <span class="text-slate-500">// 通配批量</span></div>
          <div><span class="text-slate-500">C:\\&gt;</span> <span class="text-cyan-400">scan</span>            <span class="text-slate-500">// 重扫已设媒体库</span></div>
          <div class="text-slate-500 mt-2">ERR: no such file: x.mp3  <span class="text-slate-600">// 错误回显，同终端叙事</span></div>
        </div>
      </div>
      <div class="flex-1 flex flex-col gap-3">
        <div class="text-slate-300 text-[15px] font-semibold">三条入口（统一汇入 Playlist）</div>
        <div class="bg-slate-800/70 border-l-4 border-cyan-400 rounded-r-lg p-3"><div class="text-cyan-300 font-mono text-[14px] font-bold">命令式</div><p class="text-slate-300 text-[13px]">COMMAND 区敲 load/add/scan，回显错误</p></div>
        <div class="bg-slate-800/70 border-l-4 border-green-400 rounded-r-lg p-3"><div class="text-green-300 font-mono text-[14px] font-bold">窗口态</div><p class="text-slate-300 text-[13px]">拖拽文件/文件夹进窗口 · Ctrl+O 选目录</p></div>
        <div class="bg-slate-800/70 border-l-4 border-amber-400 rounded-r-lg p-3"><div class="text-amber-300 font-mono text-[14px] font-bold">首次引导</div><p class="text-slate-300 text-[13px]">首启选音乐根目录，写入 mediaLibrary 自动加载</p></div>
        <div class="mt-1"><div class="text-slate-400 text-[13px] font-mono mb-2">支持格式</div><div class="flex flex-wrap gap-2"><span class="px-2.5 py-1 bg-slate-800/70 border border-cyan-500/30 rounded text-cyan-300 font-mono text-[12px]">FLAC</span><span class="px-2.5 py-1 bg-slate-800/70 border border-cyan-500/30 rounded text-cyan-300 font-mono text-[12px]">MP3</span><span class="px-2.5 py-1 bg-slate-800/70 border border-cyan-500/30 rounded text-cyan-300 font-mono text-[12px]">WAV</span><span class="px-2.5 py-1 bg-slate-800/70 border border-cyan-500/30 rounded text-cyan-300 font-mono text-[12px]">OGG</span><span class="px-2.5 py-1 bg-slate-800/70 border border-cyan-500/30 rounded text-cyan-300 font-mono text-[12px]">M4A</span></div></div>
      </div>
    </div>
  </div>
</div>
`);
