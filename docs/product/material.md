# Material: 仿 CMD 风格「桌面壁纸型」音乐播放器 · 实现方案

> 来源：项目内部实现方案文档《仿CMD音乐播放器_实现方案.md》(v0.1)，非外部检索材料。

## 1. Overview
- 把"仿 CMD 风格音乐播放器"做成**常驻桌面的壁纸级播放器**：平时长在桌面背景上，不遮挡任何应用窗口，真实播放本地音乐并联动频谱/歌词/进度。
- 视觉语言继承设计稿：深色背景 + 蓝色终端字体 + ASCII/命令行叙事 + Spectrum/Waveform/Playlist/stdout 模块。

## 2. Background
- 原设计稿已明确 9 区信息架构与视觉语言；本次目标是把它从"网页复刻"升级为"桌面壁纸应用"。
- 用户核心诉求：尽量模仿真实 cmd.exe 界面（深蓝底 #0000AA + 白字 + 蓝色标题栏）+ 可当壁纸不挡应用 + 背景可自定义。

## 3. Key Info
- 运行形态：桌面壁纸层（behind-desktop），类似 Wallpaper Engine / Lively。
- 技术栈：Electron（HTML/CSS 终端 UI + Node 读文件 + 原生模块实现壁纸父窗口）。
- 音频来源：本地音乐文件夹（不做在线流媒体，范围外）。
- 关键决策：支持「壁纸 ↔ 窗口」双模式一键切换（Ctrl+Alt+W）。

## 4. Evidence
- 已产出高保真预览（经典 cmd 风 + 消除抖动版）：频谱/波形改 Canvas 整数格绘制，进度条改 CSS transform，背景/主题可实时调。
- 设计稿信息层级：一级核心（歌曲/状态/进度/歌词）> 二级常用（Command/Playlist/上下首）> 三级增强（Spectrum/Waveform/格式）> 四级技术（CPU/GPU/RAM/ffprobe）。

## 5. Analysis
- 壁纸模式最大难点：Windows 桌面 WorkerW 父窗口层级（Win10/11 差异）；壁纸在窗口之下鼠标点不到 → 交互靠全局快捷键 + 可召唤控制面板。
- 反抖动约束：频谱/波形用 Canvas 整数格（非字体方块字符），进度条用 transform: scaleX/translateX + rAF。
- 媒体库导入三入口：命令式(load/add/scan) + 窗口态拖拽/Ctrl+O + 首次引导默认目录。

## 6. Outlook
- 路线图：播放核心 → Command → Playlist → 可视化 → Debug；阶段0/1 先搭骨架+真播放，阶段2 攻坚壁纸父窗口。
- 成功标准：3 步内出声、壁纸态崩溃率<1%、CPU<3%、9 区视觉保真。

## Summary
- High-authority: 1（项目内部方案文档）；Gaps: 壁纸父窗口 Win11 可行性需一次性技术 spike 确认。
