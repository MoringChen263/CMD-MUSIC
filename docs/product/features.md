# PPT Outline

## Overview
本 PPT 用于讲解《仿 CMD 风格「桌面壁纸型」音乐播放器》实现方案（v0.1）。面向评审/协作场景，按"结论先行 + 分章支撑"结构，将内部方案浓缩为 14 页可讲解的科技风幻灯片，覆盖：背景目标、产品定义、信息架构（9 区）、技术架构与壁纸模式、交互/主题/媒体库、路线图与风险。整体视觉采用深色终端（CMD）风格，呼应产品本身定位。

## Outline Content

### Page 1: 封面
- Page Type: Cover
- Page Title: 仿 CMD 风格桌面壁纸型音乐播放器
- Page Subtitle: 实现方案 v0.1 · 把命令行美学变成常驻桌面的音乐终端

### Page 2: 目录
- Page Type: TOC
- 01 背景与目标 / 02 产品定义与北极星指标 / 03 信息架构（9 区布局） / 04 技术架构与壁纸模式 / 05 交互·主题·媒体库 / 06 路线图·成功标准·风险

### Page 3: 背景与目标
- Page Type: Content
- 核心：从"网页复刻"升级为"桌面壁纸应用"；4 张关键决策卡（形态=壁纸层 / 技术栈=Electron / 交付=可运行原型 / 音频=本地文件夹）

### Page 4: 产品定义与北极星
- Page Type: Content
- 目标用户 / 核心场景 / 核心价值；北极星指标=日活壁纸在线时长+主动切歌次数；支撑指标（激活≥80% / 留存 / 互动 / 推荐）

### Page 5: 信息架构（9 区布局）
- Page Type: Content
- 3×3 区域：Header/Player/Lyrics/Command/Spectrum/Audio/Playlist/Progress；信息优先级 一级核心→四级技术

### Page 6: 技术架构
- Page Type: Content
- 三层：Renderer(HTML/CSS+Web Audio) / Main(Node 文件·快捷键·壁纸) / Native Addon(父窗口)；选型表 8 项

### Page 7: 壁纸模式关键技术
- Page Type: Content
- Windows 桌面层级：explorer→SPAWN_WORKER→找空 WorkerW→SetParent→HWND_BOTTOM，成为桌面背景

### Page 8: 交互模型与双模式切换
- Page Type: Content
- 全局快捷键（Ctrl+Alt+W/Space/N/P/C）；壁纸↔窗口 对比；一键互转价值

### Page 9: 视觉稳定性与反抖动
- Page Type: Content
- 问题：频谱/进度条抖动；约束：Canvas 整数格 / transform:scaleX / 固定宽度 / 降帧≤30fps

### Page 10: 主题与背景自定义
- Page Type: Content
- 设置项 + 5 预设（经典CMD/黑终端/绿磷光/琥珀/透明蓝）+ settings.json 持久化 + 透明度=桌面可见度

### Page 11: 媒体库与导入
- Page Type: Content
- 命令 load/add/scan；三入口（命令式/拖拽·Ctrl+O/首次引导）；格式 flac/mp3/wav/ogg/m4a

### Page 12: 分阶段路线图
- Page Type: Content
- P0 阶段0/1 → P1 阶段2/3/3b → P2 阶段4/5；MoSCoW 优先级

### Page 13: 成功标准与风险
- Page Type: Content
- 成功：3 步出声/崩溃<1%/CPU<3%/视觉保真；风险：父窗口兼容/原生模块/电耗/多屏/缺歌词

### Page 14: 结尾
- Page Type: Ending
- 下一步：确认后开始阶段0/1 原型；致谢

## Design Style
Tech 科技风（深色终端）。主色 cyan #22d3ee，强调绿 #34d399、琥珀 #fbbf24，中性 slate #94a3b8；背景深空蓝 #0a0e1f。字体 Montserrat + Noto Sans SC（标题），Noto Sans SC（正文），代码/终端处用 Courier New 等宽。网格纹理 + 发光描边，契合 CMD 命令行美学。
