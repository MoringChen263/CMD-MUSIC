window.slideDataMap.set(6, `
<div class="w-[1440px] h-[810px] shadow-2xl relative overflow-hidden slide-bg" style="font-family:'Noto Sans SC',sans-serif;">
  <div class="absolute inset-0" style="background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px);"></div>
  <div class="relative z-10 w-full h-full flex flex-col px-[70px] py-[44px]">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-9 h-9 bg-cyan-500 flex items-center justify-center text-slate-900 font-mono font-bold rounded">06</div>
      <h2 class="text-[34px] font-bold text-cyan-300 font-mono">技术架构：三层分层</h2>
    </div>
    <div class="text-slate-400 text-[15px] mb-6 font-mono">Renderer · Main(Node) · Native Addon</div>
    <div class="flex gap-6 flex-1">
      <div class="flex flex-col gap-4 w-[46%]">
        <div class="bg-slate-800/70 border-l-4 border-cyan-400 rounded-r-lg p-4"><div class="text-cyan-300 font-mono text-[16px] font-bold">① Renderer（HTML/CSS/JS）</div><div class="text-slate-300 text-[14px] mt-1">终端 UI + 9 区布局 · Web Audio 分析 → Spectrum/Waveform · Command 解析 / Playlist / Lyrics</div></div>
        <div class="bg-slate-800/70 border-l-4 border-green-400 rounded-r-lg p-4"><div class="text-green-300 font-mono text-[16px] font-bold">② Main（Node）</div><div class="text-slate-300 text-[14px] mt-1">文件对话框 / 文件夹扫描 · music-metadata 读标签 · 全局快捷键 · 壁纸父窗口调用 · 可召唤控制面板</div></div>
        <div class="bg-slate-800/70 border-l-4 border-amber-400 rounded-r-lg p-4"><div class="text-amber-300 font-mono text-[16px] font-bold">③ Native Addon（C++/koffi）</div><div class="text-slate-300 text-[14px] mt-1">定位桌面 WorkerW 句柄 · SetParent / SetWindowPos(HWND_BOTTOM) → 成为桌面背景</div></div>
      </div>
      <div class="flex-1 bg-slate-900/70 border border-cyan-500/20 rounded-lg p-5">
        <div class="text-cyan-300 font-mono text-[15px] font-bold mb-3">技术选型</div>
        <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-[14px]">
          <div class="flex justify-between border-b border-slate-700/50 pb-1"><span class="text-slate-400">UI</span><span class="text-slate-200">HTML+CSS 等宽</span></div>
          <div class="flex justify-between border-b border-slate-700/50 pb-1"><span class="text-slate-400">音频</span><span class="text-slate-200">&lt;audio&gt;+WebAudio</span></div>
          <div class="flex justify-between border-b border-slate-700/50 pb-1"><span class="text-slate-400">频谱/波形</span><span class="text-slate-200">AnalyserNode</span></div>
          <div class="flex justify-between border-b border-slate-700/50 pb-1"><span class="text-slate-400">元数据</span><span class="text-slate-200">music-metadata</span></div>
          <div class="flex justify-between border-b border-slate-700/50 pb-1"><span class="text-slate-400">歌词</span><span class="text-slate-200">.lrc 解析</span></div>
          <div class="flex justify-between border-b border-slate-700/50 pb-1"><span class="text-slate-400">快捷键</span><span class="text-slate-200">globalShortcut</span></div>
          <div class="flex justify-between border-b border-slate-700/50 pb-1"><span class="text-slate-400">壁纸化</span><span class="text-slate-200">原生父窗口</span></div>
          <div class="flex justify-between border-b border-slate-700/50 pb-1"><span class="text-slate-400">打包</span><span class="text-slate-200">electron-builder</span></div>
        </div>
      </div>
    </div>
  </div>
</div>
`);
