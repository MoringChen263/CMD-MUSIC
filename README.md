# CMD-MUSIC

> 仿 CMD 风格的**桌面壁纸音乐播放器** —— Electron 打造的「真·桌面背景层」音乐播放器。

[![Platform](https://img.shields.io/badge/platform-Windows-blue)](https://github.com/MoringChen263/cmd-music)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.0-orange.svg)](https://github.com/MoringChen263/cmd-music/releases)

**English abstract:** CMD-MUSIC is a CMD/terminal‑styled music player for Windows that can render itself directly onto the desktop background layer (behind the icons, just like Wallpaper Engine) via Electron + the Windows `WorkerW` API. It features a real Web Audio spectrum analyzer, a faux‑command‑line UI (`C:\MUSIC>` prompt), system‑tray control, real CPU/GPU/RAM metrics, and persistent themes. Windows‑only.

---

## 这是什么

CMD-MUSIC 把音乐播放器做成了一个**复古命令行（DOS / CMD）外观**的桌面程序：

- 平时它是一个无边框、半透明、黑底蓝字的「终端窗口」，面板像老式字符界面（SPECTRUM / PLAYLIST / LYRICS·STDOUT / COMMAND…）。
- 按下快捷键，它可以**整窗沉到 Windows 桌面背景层**——也就是桌面图标后面的那一层，和 Wallpaper Engine 是同一套位置。音乐播放器从此「长」在桌面上，图标照点、鼠标照用。

它不是模拟器，也不是网页壁纸，而是用 Electron 真的挂进了 `WorkerW` 桌面层。

---

## 功能特性

### 双模式显示
- **窗口模式（Window）**：独立无边框透明窗口，可拖动、缩放、最小化到托盘。
- **壁纸模式（Wallpaper）**：通过 `SetParent` 把窗口挂入 Windows 桌面背景层（`Progman` / `WorkerW`），播放器铺满桌面、位于图标之下。
  - 自动降级：挂入失败时自动退回「常驻底部窗口」并给出诊断报告，不会白屏崩溃。
  - 共存检测：检测到 Wallpaper Engine 占用同一壁纸槽时给出提示。

### 终端式界面
- 黑底 + 等宽字体（Cascadia Code / Consolas）的复古外观。
- 提示符 `C:\MUSIC>`，内置类命令行交互（输入 `?` 或 `help` 查看帮助）。
- 面板分区：**NOW PLAYING**（标题/艺术家/波形）、**LYRICS / STDOUT**（回显日志）、**COMMAND**（命令输入）、**SPECTRUM**（频谱）、**AUDIO / SYSTEM**（编码信息 + 资源占用）、**PLAYLIST**。

### 真实音频可视化
- 基于 Web Audio `AnalyserNode` 的**实时频谱**与**波形**绘制（非装饰动画）。
- 自解析音频文件容器头，读取 **codec / 采样率 / 位深 / 声道数**（不依赖 ffprobe）。

### 音乐库与播放
- 支持 `mp3 / flac / wav / ogg / m4a / aac`。
- 添加方式：选择文件、递归扫描整个文件夹。
- **持久化音乐库**：文件夹与单曲来源会被记住，重启后自动重新扫描回填，不用每次重选。
- 列表循环（LOOP）、随机（SHUFFLE）、上一首 / 下一首、播放 / 暂停。

### 系统托盘
- 运行时用 zlib **现场生成合法 PNG 托盘图标**（CMD 蓝底 + 白色 `>_`），规避了损坏图标导致启动崩溃的坑。
- 右键菜单：切换模式、交互锁、播放控制、添加文件 / 文件夹、清空音乐库、设置、桌面层诊断、退出。

### 壁纸态浮动控制条（Dock）
- 壁纸窗口在多数机器上收不到鼠标消息，因此用一个**独立的顶层置顶窗口**承担交互。
- 光标靠近自动浮现、移开自动隐藏；提供播放控制与音量滑块；位置可拖拽并记忆。
- 铁律：Dock 永不进入 `WorkerW`，否则会失去鼠标消息。

### 动态鼠标穿透（Click‑Through）
- 壁纸模式下，播放器区域之外自动穿透，桌面图标照常可点。
- **交互锁（Ctrl+Alt+L）**：必要时强制整窗可交互，用来滚动歌词 / 选歌单。

### 真实系统指标（非模拟）
- **CPU / GPU / RAM** 来自 Windows 性能计数器（`Get-Counter`，经 PowerShell 采样），不是假的随机数。
- GPU 利用率按本应用各进程 PID 过滤，是真实测量值。

### 主题
- 内置预设：`classic`（经典蓝）、`black`、`green`、`amber`、`transblue`（半透明蓝）。
- 透明度滑块，跨窗口实时同步持久化。

---

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `MediaPlayPause` / `MediaNextTrack` / `MediaPreviousTrack` | 播放/暂停、下一首、上一首（媒体键，不抢其它软件的空格/NP） |
| `Ctrl+Alt+W` | 切换 窗口 / 壁纸 模式 |
| `Ctrl+Alt+L` | 切换壁纸态交互锁（整窗可交互 / 动态穿透） |
| `Ctrl+Alt+C` | 打开控制面板 |
| `Ctrl+Alt+D` | 运行桌面层诊断（报告写入 `%TEMP%\cmdmusic_wallpaper_diag.txt`） |

---

## 命令行指令

在 `COMMAND` 面板输入（提示符 `C:\MUSIC>`），`?` 或 `help` 查看帮助：

| 指令 | 作用 |
| --- | --- |
| `load` | 选择文件夹（递归扫描） |
| `add` | 选择文件 |
| `play` | 播放 / 暂停 |
| `next` / `prev` | 下一首 / 上一首 |
| `loop` | 切换列表循环 |
| `shuffle` | 切换随机 |
| `clear` | 清空回显日志 |

---

## 安装与运行

### 方式一：直接运行预编译版（推荐）
仓库的 **Releases** 提供 `win-unpacked` 便携包，解压后双击 `CMD-MUSIC.exe` 即可，无需安装。

> 说明：便携包体积约 440 MB（含 Electron 运行时），超过 GitHub 单文件 100 MB 上限，因此**不纳入 Git 仓库**，仅作为 Release 资产发布。

### 方式二：从源码运行
```bash
# 需要 Node.js 与 Electron
npm install
npm start
```
> 构建配置见 `package.json` 的 `build` 段（electron-builder，`--win portable`）。若你使用的 Electron 版本与示例不一致，请相应调整 `devDependencies` 中的版本号。

---

## 技术架构

- **Electron**（主进程 + 渲染进程，启用 `contextIsolation`，通过 `preload.js` 安全桥接 IPC）。
- **纯原生前端**：渲染层为原生 JS / HTML / CSS，无前端框架；频谱与波形用 Canvas + Web Audio API。
- **Windows 桌面层**：主进程通过 PowerShell 调用 Windows API（`SetParent` 到 `WorkerW`）实现壁纸挂载，并自带诊断与降级逻辑。
- **真实系统指标**：通过 PowerShell `Get-Counter` 采样 CPU/GPU/RAM，主进程缓存后同步给渲染层。

```
main.js            主进程：窗口、托盘、模式切换、IPC、快捷键、诊断
preload.js         渲染层 ↔ 主进程 安全桥（contextBridge）
wallpaper.js       壁纸层挂载 / 卸载（SetParent 到 WorkerW）+ 诊断
gpuperf.js         GPU 占用率后台采样
sysmetrics.js      CPU/RAM 指标采样
audioprobe.js      音频文件头解析（codec/采样率/位深/声道）
renderer/          UI 层（index / app / settings / dockbar / control-panel）
```

---

## 局限与已知问题

- **仅支持 Windows**：依赖 `WorkerW` / `SetParent` 与 PowerShell，无法在 macOS / Linux 运行壁纸模式。
- 与 **Wallpaper Engine** 同时占用壁纸层时会互相遮挡，需先退出对方再切换。
- 壁纸模式下交互依赖浮动控制条（Dock）；若 Dock 进程异常，可用 `Ctrl+Alt+C` 控制面板或托盘菜单操作。
- 启动崩溃会写入 `%TEMP%\cmdmusic_crash.log`，便于排查。

---

## 许可证

[MIT](LICENSE) © MoringChen263

---

> 仓库地址（请按需修改）：https://github.com/MoringChen263/cmd-music
