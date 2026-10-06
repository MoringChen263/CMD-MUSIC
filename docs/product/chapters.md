# 章节规划 — 仿 CMD 风格桌面壁纸型音乐播放器 · 实现方案讲解

> PPT 类型：Product / 方案讲解（Report 结构，结论先行 + 分章支撑）
> 风格：Tech（深色终端风，契合 CMD 主题）｜总页数：14

## Page 1: 封面
- **Page Type**: Cover
- **Page Title**: 仿 CMD 风格桌面壁纸型音乐播放器（副标题：实现方案 v0.1 · 把命令行美学变成常驻桌面的音乐终端）
- **Selected Template**: cover/tech/036.tpl
- **Content Structure**: 主标题 + 副标题 + "SYSTEM ONLINE" 状态标 + 讲解场景提示
- **Image Requirements**: 无
- **Page Weight**: 核心页

## Page 2: 目录
- **Page Type**: TOC
- **Page Title**: 目录 / CONTENTS
- **Selected Template**: toc/tech/3517.tpl
- **Content Structure**: 6 章导航
  - 01 背景与目标
  - 02 产品定义与北极星指标
  - 03 信息架构（9 区布局）
  - 04 技术架构与壁纸模式
  - 05 交互 / 主题 / 媒体库
  - 06 路线图 · 成功标准 · 风险
- **Image Requirements**: 无

## Page 3: 背景与目标
- **Page Type**: Content
- **Page Title**: 背景与目标（副标题：从"网页复刻"到"桌面壁纸应用"）
- **Selected Template**: content/tech/1581.tpl
- **Content Structure**: Argument — 核心结论 + 4 张关键决策卡（形态/技术栈/交付/音频来源）+ 说明段
- **Image Requirements**: 无
- **Page Weight**: 核心页

## Page 4: 产品定义与北极星
- **Page Type**: Content
- **Page Title**: 产品定义与北极星指标
- **Selected Template**: content/tech/1582.tpl
- **Content Structure**: 3 张原则卡（目标用户 / 核心场景 / 核心价值）+ 北极星指标 + 支撑指标（激活≥80% / 留存 / 互动 / 推荐）
- **Image Requirements**: 无

## Page 5: 信息架构（9 区布局）
- **Page Type**: Content
- **Page Title**: 信息架构：9 区布局
- **Selected Template**: content/tech/1581.tpl（扩展为 3×3 自定义网格）
- **Content Structure**: 3×3 区域卡（Header/Player/Lyrics/Command/Spectrum/Audio/Playlist/Progress）+ 信息优先级条（一级核心→四级技术）
- **Image Requirements**: 无

## Page 6: 技术架构
- **Page Type**: Content
- **Page Title**: 技术架构：三层分层
- **Selected Template**: content/tech/1583.tpl
- **Content Structure**: 3 层（Renderer HTML/CSS+Web Audio / Main Node 文件·快捷键·壁纸 / Native Addon 父窗口）+ 选型表（UI/音频/频谱/元数据/歌词/快捷键/壁纸/打包）
- **Image Requirements**: 无

## Page 7: 壁纸模式关键技术
- **Page Type**: Content
- **Page Title**: 壁纸模式：Windows 父窗口
- **Selected Template**: content/tech/1584.tpl
- **Content Structure**: 5 节点流程图（explorer → SPAWN_WORKER → 找空 WorkerW → SetParent → HWND_BOTTOM 桌面背景）+ 说明（图标与所有窗口浮于其上）
- **Image Requirements**: 无

## Page 8: 交互模型与双模式切换
- **Page Type**: Content
- **Page Title**: 交互：壁纸 ↔ 窗口 双模式
- **Selected Template**: content/tech/1585.tpl（自定义对比表）
- **Content Structure**: 全局快捷键表（Ctrl+Alt+W/Space/N/P/C）+ 壁纸↔窗口 对比表（父窗口/层级/任务栏/边框/鼠标）+ 价值点
- **Image Requirements**: 无

## Page 9: 视觉稳定性与反抖动
- **Page Type**: Content
- **Page Title**: 视觉稳定性：反抖动约束
- **Selected Template**: content/tech/1581.tpl
- **Content Structure**: Problem（频谱/进度条抖动根因）+ 4 条约束（Canvas 整数格 / transform:scaleX / 固定宽度容器 / 降帧≤30fps）
- **Image Requirements**: 无

## Page 10: 主题与背景自定义
- **Page Type**: Content
- **Page Title**: 主题与背景自定义
- **Selected Template**: content/tech/1582.tpl（自定义）
- **Content Structure**: 设置项（背景/前景/强调/透明度/边框）+ 预设主题（经典CMD/黑终端/绿磷光/琥珀/透明蓝）+ 持久化 settings.json + 透明度=桌面可见度
- **Image Requirements**: 无

## Page 11: 媒体库与导入（如何加歌）
- **Page Type**: Content
- **Page Title**: 媒体库与导入
- **Selected Template**: content/tech/1587.tpl
- **Content Structure**: 代码编辑器展示命令（load/add/scan）+ 三入口（命令式/窗口拖拽·Ctrl+O/首次引导）+ 格式（flac/mp3/wav/ogg/m4a）
- **Image Requirements**: 无

## Page 12: 分阶段路线图
- **Page Type**: Content
- **Page Title**: 分阶段路线图
- **Selected Template**: content/tech/1677.tpl（自定义时间轴）
- **Content Structure**: 时间轴 P0 阶段0/1 → P1 阶段2/3/3b → P2 阶段4/5，标注 MoSCoW 优先级
- **Image Requirements**: 无

## Page 13: 成功标准与风险
- **Page Type**: Content
- **Page Title**: 成功标准与风险边界
- **Selected Template**: content/tech/1589.tpl（自定义两栏）
- **Content Structure**: 左栏成功标准（3 步出声/崩溃<1%/CPU<3%/视觉保真）+ 右栏风险表（父窗口兼容/原生模块/电耗/多屏/缺歌词）
- **Image Requirements**: 无

## Page 14: 结尾
- **Page Type**: Ending
- **Page Title**: 下一步（副标题：确认后即开始阶段0/1 原型）
- **Selected Template**: ending/tech/1017.tpl
- **Content Structure**: 下一步行动点 + 致谢
- **Image Requirements**: 无
