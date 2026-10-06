# CMD-MUSIC

> 仿 Windows 命令行（cmd.exe）风格的桌面音乐播放器 —— 能直接挂到桌面背景层当「真·壁纸」用。
>
> A retro Windows **cmd.exe**-style desktop music player that can dock itself into the real desktop wallpaper layer.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-blue?logo=windows)](https://www.microsoft.com/windows)
[![Electron](https://img.shields.io/badge/Electron-31-47848f?logo=electron)](https://www.electronjs.org/)

---

## 📌 一句话简介 / TL;DR

把音乐播放器做成一台「命令行终端」：**蓝底白字、标题栏写着 `C:\WINDOWS\system32\cmd.exe`、命令提示符是 `C:\MUSIC>`**。
它既能当普通窗口用，也能一键下沉到 Windows 桌面背景层，变成贴在你图标后面的「会放歌的壁纸」——桌面图标照样能点。

**建议的 GitHub 仓库描述（Repository description）：**

- 中文：`仿 CMD 终端风格的 Windows 桌面壁纸音乐播放器，支持真·桌面背景层、实时音频频谱、命令行交互与媒体键控制。`
- 英文：`A retro CMD/terminal-style music player for Windows that runs as a real desktop wallpaper layer, with live spectrum visualizer, CLI, and media-key control.`

---

## ✨ 特性

- 🖥️ **终端美学 UI**：仿 cmd.exe 的蓝底配色、标题栏、命令提示符与等宽字体风格。
- 🧱 **真·桌面壁纸模式**：通过 Windows `WorkerW` 背景层把整个播放器挂到桌面之下（不占任务栏、桌面图标可点、鼠标可穿透）。
- 📊 **实时音频可视化**：基于 Web Audio `AnalyserNode` 的频谱（SPECTRUM）与波形（WAVEFORM）双画布。
- ⌨️ **命令行交互**：内置 `COMMAND` 面板，输入 `help` 即可查看全部指令（见下方命令表）。
- 📜 **歌词 / 输出日志面板**：滚动的 STDOUT 风格日志，操作反馈一目了然。
- 🎚️ **播放列表**：支持文件夹递归扫描与单曲添加，覆盖 `mp3 / flac / wav / ogg / m4a / aac`。
- 🎮 **媒体键 + 全局快捷键**：播放/暂停/上下首媒体键，外加 `Ctrl+Alt+W/L/C/D` 快捷操作。
- 🔔 **系统托盘 + 浮动控制条 + 控制面板**：壁纸模式下也能轻松交互。
- 📈 **真实系统指标**：顶栏实时显示 FPS / CPU% / **GPU%**（读 Windows 性能计数器，真实测量本应用占用）/ RAM%。
- 🔍 **音频文件头解析**：自行逐位解析容器头，显示 codec / sample / bit / channel（无需 ffprobe）。
- 🎨 **主题系统**：内置 5 套预设（classic / black / green / amber / transblue），支持自定义背景色、前景色、高亮色与整屏透明度，并持久化保存。
- 💾 **音乐库持久化**：退出后保留已添加的文件夹/单曲，重启自动恢复。
- 🛡️ **健壮启动**：托盘图标运行时生成合法 PNG；崩溃与壁纸挂载异常自动落盘诊断（`%TEMP%\cmdmusic_crash.log`、`cmdmusic_wallpaper_diag.txt`）。

---

## 📸 截图

> 截图占位：请从窗口模式 / 壁纸模式各截一张，替换下面路径。
> 建议命名：`docs/screenshot-window.png`、`docs/screenshot-wallpaper.png`。

<p align="center">
  <img src="docs/screenshot-window.png" alt="CMD-MUSIC 窗口模式" width="720" />
  <br/><sub>窗口模式：仿 cmd.exe 的终端界面</sub>
</p>

<p align="center">
  <img src="docs/screenshot-wallpaper.png" alt="CMD-MUSIC 壁纸模式" width="720" />
  <br/><sub>壁纸模式：播放器沉入桌面背景层，图标依然可点</sub>
</p>

---

## 🚀 安装

### 方式一：下载 Release（推荐）

前往仓库的 **Releases** 页面，下载 Windows 安装包（`NSIS .exe`），双击安装即可。

> 安装包由 `electron-builder` 生成，目标为 `win -> nsis`。

### 方式二：从源码构建

需要已安装 [Node.js](https://nodejs.org/)（建议 ≥ 18）与 npm。

```bash
# 1. 克隆仓库
git clone https://github.com/<your-username>/cmd-music.git
cd cmd-music

# 2. 安装依赖（仅开发依赖：electron + electron-builder，运行时零第三方依赖）
npm install

# 3. 启动（开发预览）
npm start

# 4. 打包为免安装目录
npm run pack

# 5. 打包为 Windows 安装程序
npm run dist
```

---

## 🎮 使用

### 全局快捷键

| 快捷键 | 功能 |
| --- | --- |
| `MediaPlayPause` / `MediaNextTrack` / `MediaPreviousTrack` | 媒体键：播放暂停 / 下一首 / 上一首 |
| `Ctrl + Alt + W` | 切换「窗口模式 ⇄ 壁纸模式」 |
| `Ctrl + Alt + L` | 壁纸态交互锁（强制整窗可交互 / 交回动态穿透） |
| `Ctrl + Alt + C` | 召唤控制面板（always-on-top 小窗） |
| `Ctrl + Alt + D` | 运行桌面层诊断（排查壁纸挂载问题） |

### 命令行指令

在界面底部的 `COMMAND` 面板输入指令（输入 `?` 或 `help` 也能查看）：

| 命令 | 说明 |
| --- | --- |
| `?` / `help` | 显示帮助 |
| `load` | 打开文件夹选择器（递归添加音乐） |
| `add` | 打开文件选择器添加单曲 |
| `play [n]` | 播放（可选曲目序号，从 1 开始） |
| `next` / `prev` | 下一首 / 上一首 |
| `loop` | 切换列表循环 |
| `shuffle` | 切换随机播放 |
| `scan` | 重新列出播放列表 |
| `clear` | 清屏 |
| `clear library` | 清空音乐库（同时清掉持久化的文件夹/单曲） |

> 提示：壁纸模式下主窗口不可直接点击，请用 `Ctrl+Alt+C` 控制面板或系统托盘右键菜单操作。

---

## 🖥️ 两种模式

- **窗口模式（WINDOW）**：普通无边框透明窗口，可拖动、缩放、最小化，关闭即隐藏到托盘。
- **壁纸模式（WALLPAPER）**：整个播放器通过 `SetParent` 挂入 Windows 桌面 `WorkerW` 背景层。
  - 不占用任务栏，贴在所有桌面图标之后；
  - 桌面图标仍可直接点击（动态鼠标穿透）；
  - 交互交由「浮动控制条（光标靠近屏幕底部自动浮现）+ 控制面板 + 托盘」承担；
  - 若检测到 **Wallpaper Engine** 占用同一壁纸槽，会被压在其下方——请先完全退出 Wallpaper Engine 再切换。

---

## 🎨 主题

内置预设，可在「设置」窗口（`Ctrl+Alt+C` → `⚙ 设置…`）切换或自定义：

| 预设 | 风格 |
| --- | --- |
| `classic` | 经典 Windows 蓝底 |
| `black` | 纯黑终端 |
| `green` | 黑绿黑客风 |
| `amber` | 琥珀单色 CRT 风 |
| `transblue` | 半透明蓝（默认 60% 透明度） |

透明度采用**分层叠乘反解算法**，让「透明度滑块」在窗口态（3 层）与壁纸态（2 层）下都做到「拖到几就是几」，所见即所得。

---

## 🔧 技术栈

- **Electron 31** —— 跨平台桌面壳。
- **原生 Node 模块（运行时零依赖）** —— `main.js` / `wallpaper.js` / `sysmetrics.js` / `gpuperf.js` / `audioprobe.js` 全部只依赖 Node 内置模块，无第三方运行时包。
- **HTML5 Canvas + Web Audio API** —— 频谱 / 波形可视化与分析。
- **Windows PowerShell** —— 壁纸层挂载（`SetParent` 到 `WorkerW`）与 GPU 占用率采样（性能计数器 `\GPU Engine(*)\Utilization Percentage`）。
- **自研文件头解析** —— 逐位解析音频容器头，提取 codec / sample / bit / channel。

---

## 🐛 已知问题与排错

- **壁纸模式看不到播放器？** 多半是 **Wallpaper Engine** 占了同一个壁纸槽。请先完全退出 Wallpaper Engine，再 `Ctrl+Alt+W` 切换。诊断报告会写入 `%TEMP%\cmdmusic_wallpaper_diag.txt`（`Ctrl+Alt+D` 可手动触发）。
- **启动即崩溃？** 崩溃日志在 `%TEMP%\cmdmusic_crash.log`。本项目已修复「托盘图标 PNG 损坏导致 `new Tray()` 失败」这类启动崩溃。
- **GPU 显示为 `--`？** 表示当前环境无法启用硬件加速（恒定环境状态），不影响播放，频谱动画会退化为软件渲染。
- **平台限制**：壁纸模式依赖 Windows 桌面结构，**仅在 Windows 上可用**；macOS / Linux 仅能运行窗口模式。

---

## 🛠️ 开发

```bash
npm install      # 安装 electron + electron-builder
npm start        # 启动应用（start.js 会自动清理 ELECTRON_RUN_AS_NODE 环境变量）
```

主要源码结构：

```
main.js                主进程：窗口 / 壁纸模式 / 托盘 / 快捷键 / IPC
wallpaper.js           桌面 WorkerW 背景层挂载与诊断
sysmetrics.js          系统指标采样（CPU / RAM / GPU 加速状态）
gpuperf.js             本应用真实 GPU 占用率（Windows 性能计数器）
audioprobe.js          音频文件头解析（codec/sample/bit/channel）
renderer/              渲染层（app.js / index.html / styles.css / 控制面板 / 设置 / 控制条）
```

---

## 📄 许可证

[MIT](LICENSE) —— 可自由使用、修改与再分发。

---

<p align="center">
  <sub>CMD-MUSIC · 让命令行也会放歌 · Built with Electron</sub>
</p>
