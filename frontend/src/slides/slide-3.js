window.slideDataMap.set(3, `
<div class="w-[1440px] h-[810px] shadow-2xl relative overflow-hidden slide-bg" style="font-family:'Noto Sans SC',sans-serif;">
  <div class="absolute inset-0" style="background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px);"></div>
  <div class="relative z-10 w-full h-full flex flex-col px-[70px] py-[44px]">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-9 h-9 bg-cyan-500 flex items-center justify-center text-slate-900 font-mono font-bold rounded">03</div>
      <h2 class="text-[34px] font-bold text-cyan-300 font-mono">背景与目标</h2>
    </div>
    <div class="text-slate-400 text-[15px] mb-5 font-mono">从"网页复刻"升级为"桌面壁纸应用"</div>
    <div class="bg-slate-800/70 border-l-4 border-cyan-400 rounded-r-lg p-5 mb-6">
      <p class="text-slate-200 text-[17px] leading-relaxed">原设计稿已明确 9 区视觉语言与终端叙事；本次把它从"网页复刻"升级为<span class="text-cyan-300 font-semibold">"桌面壁纸应用"</span>——平时长在桌面背景上，不遮挡任何应用窗口，真实播放本地音乐并联动频谱 / 歌词 / 进度。</p>
    </div>
    <div class="grid grid-cols-2 gap-5 mb-5">
      <div class="bg-gradient-to-br from-cyan-600/20 to-blue-600/20 border border-cyan-500/30 rounded-lg p-5">
        <div class="flex items-center gap-2 mb-2"><span class="w-7 h-7 bg-cyan-500 text-slate-900 font-mono font-bold rounded flex items-center justify-center text-[13px]">01</span><h4 class="text-[19px] font-bold text-cyan-300 font-mono">运行形态</h4></div>
        <p class="text-slate-300 text-[15px] leading-snug">桌面壁纸层（behind-desktop），类似 Wallpaper Engine / Lively，不覆盖应用窗口</p>
      </div>
      <div class="bg-gradient-to-br from-green-600/20 to-teal-600/20 border border-green-500/30 rounded-lg p-5">
        <div class="flex items-center gap-2 mb-2"><span class="w-7 h-7 bg-green-500 text-slate-900 font-mono font-bold rounded flex items-center justify-center text-[13px]">02</span><h4 class="text-[19px] font-bold text-green-300 font-mono">技术栈</h4></div>
        <p class="text-slate-300 text-[15px] leading-snug">Electron：HTML/CSS 终端 UI + Node 读文件 + 原生模块实现壁纸父窗口</p>
      </div>
      <div class="bg-gradient-to-br from-amber-600/20 to-orange-600/20 border border-amber-500/30 rounded-lg p-5">
        <div class="flex items-center gap-2 mb-2"><span class="w-7 h-7 bg-amber-500 text-slate-900 font-mono font-bold rounded flex items-center justify-center text-[13px]">03</span><h4 class="text-[19px] font-bold text-amber-300 font-mono">交付范围</h4></div>
        <p class="text-slate-300 text-[15px] leading-snug">可运行原型（真实播放本地音乐），分阶段落地，先出最小可用版本</p>
      </div>
      <div class="bg-gradient-to-br from-purple-600/20 to-fuchsia-600/20 border border-purple-500/30 rounded-lg p-5">
        <div class="flex items-center gap-2 mb-2"><span class="w-7 h-7 bg-purple-500 text-slate-900 font-mono font-bold rounded flex items-center justify-center text-[13px]">04</span><h4 class="text-[19px] font-bold text-purple-300 font-mono">音频来源</h4></div>
        <p class="text-slate-300 text-[15px] leading-snug">本地音乐文件夹（不做在线流媒体，本期范围外）</p>
      </div>
    </div>
    <div class="text-slate-400 text-[14px] font-mono">// 已与用户对齐：尽量模仿真实 cmd.exe 界面 + 可当壁纸不挡应用 + 背景可自定义</div>
  </div>
</div>
`);
