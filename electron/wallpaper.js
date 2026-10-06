/* ============================================================
   wallpaper.js — 把播放器挂到 Windows 桌面背景层（像 Wallpaper Engine 那样"变成壁纸"）

   原理（与 Lively / Wallpaper Engine 同源）：
     1. 用 GetShellWindow() 拿 Progman（桌面外壳根）
     2. 在【Progman 的子窗口】里找不含 SHELLDLL_DefView 的 WorkerW —— 那是"纯背景层"
        （Win11 24H2 上纯背景 WorkerW 是 Progman 的子窗口，顶层 EnumWindows 永远看不到）
     3. 找不到才向 Progman 发 0x052C (WM_USER+0x2C) 让 Explorer 分裂出一个背景层
     4. 把 Electron 窗口 SetParent 到那个纯背景 WorkerW
     5. 改窗口样式：加 WS_CHILD、去 WS_POPUP/WS_OVERLAPPEDWINDOW，并 SWP_FRAMECHANGED
     6. 按【父窗口坐标系】重新定位尺寸（SetParent 后坐标系变了，这是最常见的失败原因）
   全部通过 PowerShell 调 user32.dll P/Invoke，零原生依赖。

   多策略降级（全部失败才退化为"常驻底部"）：
     A → Progman 子窗口里的纯背景 WorkerW（图标层之下，最理想）
     B → 图标层（Progman 自身或含 DefView 的 WorkerW）
     C → Progman 根窗口
     D → 不改父窗口，仅 SetWindowPos(HWND_BOTTOM)

   注：Electron 没有 setAlwaysOnBottom API，压 z 序只能用 Win32 SetWindowPos。
   ============================================================ */
'use strict';

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { screen } = require('electron');

function isWindows() { return process.platform === 'win32'; }

// 与 main.js 的 CRASH_LOG 同一份文件：PowerShell 的 stderr 是 GBK 字节，
// 直接打到控制台必然乱码且误导排障，落盘才看得清。
const PS_LOG = path.join(process.env.TEMP || process.env.LOCALAPPDATA || '.', 'cmdmusic_crash.log');
function psLog(m) { try { fs.appendFileSync(PS_LOG, `[${new Date().toISOString()}] ${m}\n`); } catch { /* ignore */ } }

function safe(win, method, ...args) {
  try { if (win && typeof win[method] === 'function') { win[method](...args); return true; } } catch (_) {}
  return false;
}

// Electron 窗口句柄（HWND）→ 十进制字符串
function hwndString(win) {
  try {
    const buf = win.getNativeWindowHandle();
    if (buf.length === 8) return buf.readBigUInt64LE(0).toString();
    if (buf.length === 4) return buf.readUInt32LE(0).toString();
  } catch (_) {}
  return '0';
}

function getScreenSize() {
  try {
    // 壁纸要铺满【整个屏幕】含任务栏区域，所以用 bounds 而不是 workAreaSize
    const b = screen.getPrimaryDisplay().bounds;
    return { width: b.width, height: b.height };
  } catch {
    return { width: 1920, height: 1080 };
  }
}

/* PowerShell 脚本主体（内联 C# P/Invoke）。
   注意：脚本内注释一律用 ASCII —— 将来若改为落盘 .ps1 执行，
   PS 5.1 会按 GBK 解析无 BOM 的 UTF-8 文件，中文注释会直接报语法错。
   $child / $action / $SCREEN_W / $SCREEN_H 由 runPs() 校验后内联到脚本头部——
   因为 powershell -Command 的尾部参数不会进 $args（会被拼进脚本文本导致解析错误）。
   注入名必须用 SCREEN_W/SCREEN_H 这种不可能与局部变量撞名的全称：
   PowerShell 变量名大小写不敏感，旧的 $W/$H 会被 Layout-Child([IntPtr]$h) 的形参遮蔽。 */
const PS_BODY = `
$code = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinApi {
  public delegate bool EWP(IntPtr h, IntPtr l);
  // CharSet.ExactSpelling=true is REQUIRED here: without it the CLR probes
  // "FindWindowWW"/"GetClassNameWW" (method name + W suffix) and every call fails.
  // With CharSet.None (the old code) wide-char APIs were marshalled as ANSI:
  // GetClassNameW returned only 'P' and FindWindowW always returned 0.
  [DllImport("user32.dll", EntryPoint="FindWindowW", CharSet=CharSet.Unicode, ExactSpelling=true)]
  public static extern IntPtr FindWindowW(string c, string w);
  [DllImport("user32.dll", EntryPoint="FindWindowExW", CharSet=CharSet.Unicode, ExactSpelling=true)]
  public static extern IntPtr FindWindowExW(IntPtr p, IntPtr a, string c, string w);
  [DllImport("user32.dll", EntryPoint="SendMessageW")]
  public static extern IntPtr SendMessageW(IntPtr h, uint m, IntPtr wp, IntPtr lp);
  [DllImport("user32.dll", EntryPoint="SetParent")]
  public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll", EntryPoint="GetParent")]
  public static extern IntPtr GetParent(IntPtr child);
  [DllImport("user32.dll", EntryPoint="SetWindowPos")]
  public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll", EntryPoint="EnumWindows")]
  public static extern int EnumWindows(EWP fn, IntPtr l);
  [DllImport("user32.dll", EntryPoint="EnumChildWindows")]
  public static extern int EnumChildWindows(IntPtr parent, EWP fn, IntPtr l);
  [DllImport("user32.dll", EntryPoint="GetClassNameW", CharSet=CharSet.Unicode, ExactSpelling=true)]
  public static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", EntryPoint="GetWindowTextW", CharSet=CharSet.Unicode, ExactSpelling=true)]
  public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", EntryPoint="GetDesktopWindow")]
  public static extern IntPtr GetDesktopWindow();
  [DllImport("user32.dll", EntryPoint="GetShellWindow")]
  public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")]
  public static extern int GetWindowLongW(IntPtr h, int i);
  [DllImport("user32.dll", EntryPoint="SetWindowLongW", SetLastError=true)]
  public static extern int SetWindowLongW(IntPtr h, int i, int v);
  [DllImport("user32.dll", EntryPoint="IsWindowVisible")]
  public static extern bool IsWindowVisible(IntPtr h);
}
'@
Add-Type -TypeDefinition $code -Language CSharp -ErrorAction Stop

function Get-Class([IntPtr]$h) {
  if ($h -eq [IntPtr]::Zero) { return '' }
  $sb = New-Object System.Text.StringBuilder 256
  [WinApi]::GetClassNameW($h, $sb, 256) | Out-Null
  return $sb.ToString()
}
function Get-Title([IntPtr]$h) {
  if ($h -eq [IntPtr]::Zero) { return '' }
  $sb = New-Object System.Text.StringBuilder 256
  [WinApi]::GetWindowTextW($h, $sb, 256) | Out-Null
  return $sb.ToString()
}
# first descendant in enumeration order, optionally skipping one hwnd (used to spot
# who already owns the wallpaper slot without reporting our own window back)
function Find-FirstDescendant([IntPtr]$root, [IntPtr]$skip) {
  $script:ff = [IntPtr]::Zero
  if ($root -eq [IntPtr]::Zero) { return $script:ff }
  $cb = [WinApi+EWP] {
    param($h,$l)
    if ($script:ff -eq [IntPtr]::Zero) {
      if ($h -ne $skip) { $script:ff = $h; return $false }
    }
    return $true
  }
  [WinApi]::EnumChildWindows($root, $cb, [IntPtr]::Zero) | Out-Null
  return $script:ff
}

# Depth-first descendant search. EnumChildWindows already walks the WHOLE subtree,
# so this also covers the case where SHELLDLL_DefView is not a direct child.
# NOTE: EnumChildWindows(NULL) enumerates all TOP-LEVEL windows, hence the Zero guard.
function Find-Descendant([IntPtr]$root, [string]$cls) {
  $script:found = [IntPtr]::Zero
  if ($root -eq [IntPtr]::Zero) { return $script:found }
  $cb = [WinApi+EWP] {
    param($h,$l)
    if ($script:found -eq [IntPtr]::Zero) {
      if ((Get-Class $h) -eq $cls) { $script:found = $h; return $false }
    }
    return $true
  }
  [WinApi]::EnumChildWindows($root, $cb, [IntPtr]::Zero) | Out-Null
  return $script:found
}
function Find-DescendantLike([IntPtr]$root, [string]$sub) {
  $script:fdl = [IntPtr]::Zero
  if ($root -eq [IntPtr]::Zero) { return $script:fdl }
  $cb = [WinApi+EWP] {
    param($h,$l)
    if ($script:fdl -eq [IntPtr]::Zero) {
      if ((Get-Class $h) -like ('*' + $sub + '*')) { $script:fdl = $h; return $false }
    }
    return $true
  }
  [WinApi]::EnumChildWindows($root, $cb, [IntPtr]::Zero) | Out-Null
  return $script:fdl
}
function Has-DefView([IntPtr]$w) { return (Find-Descendant $w 'SHELLDLL_DefView') -ne [IntPtr]::Zero }

# Progman handle. FindWindowW('Progman', NULL) returns 0 on Win11 24H2
# (its title is 'Program Manager', not NULL), so GetShellWindow() is primary.
# Fallback matches on CLASS NAME only: FindWindowExW(NULL, NULL, 'Progman', NULL)
# needs no title, and the 'Program Manager' title is localized on non-English
# Windows, which made the old FindWindowW call fail there.
function Get-Progman {
  $p = [WinApi]::GetShellWindow()
  if ($p -ne [IntPtr]::Zero) { return $p }
  return [WinApi]::FindWindowExW([IntPtr]::Zero, [IntPtr]::Zero, 'Progman', $null)
}

# ALL top-level WorkerW windows. On this machine none of them is the desktop layer
# (they belong to CapCut / Settings / QQ ...), so this is DIAGNOSTIC ONLY.
function Get-TopWorkerWList {
  $script:wl = New-Object System.Collections.ArrayList
  $cb = [WinApi+EWP] { param($h,$l) if ((Get-Class $h) -eq 'WorkerW') { $script:wl.Add($h) | Out-Null } return $true }
  [WinApi]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
  return $script:wl
}

# The REAL desktop layer: a WorkerW inside Progman's subtree that has no
# SHELLDLL_DefView below it. On Win11 24H2 this is Progman's direct child (131882),
# which top-level EnumWindows can never see.
function Get-BgWorkerW([IntPtr]$prog) {
  $script:bgl = New-Object System.Collections.ArrayList
  if ($prog -eq [IntPtr]::Zero) { return $script:bgl }
  $cb = [WinApi+EWP] {
    param($h,$l)
    if ((Get-Class $h) -eq 'WorkerW') { $script:bgl.Add($h) | Out-Null }
    return $true
  }
  [WinApi]::EnumChildWindows($prog, $cb, [IntPtr]::Zero) | Out-Null
  return $script:bgl
}
function Pick-BackgroundWorkerW([IntPtr]$prog) {
  $list = @(Get-BgWorkerW $prog)
  foreach ($w in $list) { if ((-not (Has-DefView $w)) -and [WinApi]::IsWindowVisible($w)) { return $w } }
  foreach ($w in $list) { if (-not (Has-DefView $w)) { return $w } }
  return [IntPtr]::Zero
}
# Icon layer: Progman itself holds SHELLDLL_DefView on 24H2; on older layouts it is a WorkerW.
function Pick-IconLayer([IntPtr]$prog) {
  if ($prog -eq [IntPtr]::Zero) { return [IntPtr]::Zero }
  if (Has-DefView $prog) { return $prog }
  foreach ($w in @(Get-BgWorkerW $prog)) { if (Has-DefView $w) { return $w } }
  return [IntPtr]::Zero
}

# ---- style constants (computed at runtime, no magic masks) ----
$GWL_STYLE = -16
[int64]$WS_CHILD = 0x40000000
[int64]$WS_POPUP = 0x80000000
[int64]$WS_OVERLAPPEDWINDOW = 0x00CF0000
[int64]$WS_CLIPSIBLINGS = 0x04000000
[int64]$WS_VISIBLE = 0x10000000
$NOT_CHILD = -bnot ([int64]0x40000000)
$NOT_POPUP = -bnot ([int64]0x80000000)
$NOT_OVL   = -bnot ([int64]0x00CF0000)

# int64 bit patterns above can exceed Int32 range (bit31 set) -> explicit truncation.
# The mask MUST be written as [int64]4294967295: in PS 5.1 the literal 0xFFFFFFFF is
# Int32 -1, so "-band 0xFFFFFFFF" sign-extends and the truncation silently fails.
function To-I32([int64]$v) {
  [int64]$MASK32 = 4294967295
  [int64]$u = $v -band $MASK32
  if ($u -ge 2147483648) { return [int]($u - 4294967296) }
  return [int]$u
}

function Make-Child([IntPtr]$h) {
  $st = [int64][WinApi]::GetWindowLongW($h, $GWL_STYLE)
  $new = ($st -bor $WS_CHILD) -band $NOT_POPUP
  $new = $new -band $NOT_OVL
  [WinApi]::SetWindowLongW($h, $GWL_STYLE, (To-I32 $new)) | Out-Null
  return $new
}
function Make-TopLevel([IntPtr]$h) {
  $st = [int64][WinApi]::GetWindowLongW($h, $GWL_STYLE)
  $new = ($st -band $NOT_CHILD) -bor $WS_POPUP
  $new = $new -bor $WS_OVERLAPPEDWINDOW
  $new = $new -bor $WS_CLIPSIBLINGS
  [WinApi]::SetWindowLongW($h, $GWL_STYLE, (To-I32 $new)) | Out-Null
  return $new
}
# After SetParent the coordinate system is the PARENT's client area, so position+size
# must be re-issued explicitly or the window keeps its old screen coords (invisible/off-screen).
# flags 0x0070 = NOACTIVATE(0x0010) | FRAMECHANGED(0x0020) | SHOWWINDOW(0x0040)
#   - NO SWP_NOZORDER here on purpose: hWndInsertAfter = HWND_BOTTOM(1) puts us at the
#     bottom of the wallpaper layer, which is the safe choice when another wallpaper
#     app (Wallpaper Engine) already owns that slot.
# NOTE: the parameter must NOT be named $h or $H. PowerShell variable names are
# case-insensitive, so a param([IntPtr]$h) would SHADOW the script-scope screen
# height and SetWindowPos would receive an HWND in the cy slot. The screen size is
# injected as $SCREEN_W / $SCREEN_H precisely so it can never collide again.
function Layout-Child([IntPtr]$childWin) {
  [WinApi]::SetWindowPos($childWin, [IntPtr]1, 0, 0, $SCREEN_W, $SCREEN_H, 0x0070) | Out-Null
}

if ($action -eq 'enable') {
  $prog = Get-Progman
  $iconLayer = Pick-IconLayer $prog
  $bg = Pick-BackgroundWorkerW $prog
  $split = 0
  # No pure background layer yet -> ask Explorer to split one off Progman, then retry once.
  if ($bg -eq [IntPtr]::Zero -and $prog -ne [IntPtr]::Zero) {
    [WinApi]::SendMessageW($prog, 0x052C, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    Start-Sleep -Milliseconds 350
    $bg = Pick-BackgroundWorkerW $prog
    $split = 1
  }

  # Explicit strategy labels - never back-infer them from hwnd comparisons.
  $cands = @()
  if ($bg -ne [IntPtr]::Zero) { $cands += ,@{h=$bg; s='A'} }
  if ($iconLayer -ne [IntPtr]::Zero -and $iconLayer -ne $bg) { $cands += ,@{h=$iconLayer; s='B'} }
  if ($prog -ne [IntPtr]::Zero -and $prog -ne $bg -and $prog -ne $iconLayer) { $cands += ,@{h=$prog; s='C'} }

  $tried = @()
  $done = ''
  $strat = ''
  foreach ($cand in $cands) {
    # NOT $h: script-scope $h would be a case-insensitive twin of the injected $H.
    $candHwnd = $cand.h
    if ($candHwnd -eq [IntPtr]::Zero) { continue }
    if ($tried -contains $candHwnd.ToString()) { continue }
    $tried += $candHwnd.ToString()
    Make-Child $child | Out-Null
    $prev = [WinApi]::SetParent($child, $candHwnd)
    Layout-Child $child
    $now = [WinApi]::GetParent($child)
    if ($now -eq $candHwnd) {
      $strat = $cand.s
      $done = "OK strategy=$strat parent=$($candHwnd.ToString()) progman=$($prog.ToString()) iconLayer=$($iconLayer.ToString()) bg_child_workerw=$($bg.ToString()) split=$split prev=$($prev.ToString()) z=bottom"
      break
    } else {
      # this layer refused the parent -> go back top-level and try the next candidate
      Make-TopLevel $child | Out-Null
      [WinApi]::SetParent($child, [IntPtr]::Zero) | Out-Null
    }
  }
  if ($done -eq '') {
    # Strategy D: keep it top-level, only sink to the bottom of the z-order.
    Make-TopLevel $child | Out-Null
    [WinApi]::SetParent($child, [IntPtr]::Zero) | Out-Null
    # 0x0253 = NOSIZE(0x0001)|NOMOVE(0x0002)|NOACTIVATE(0x0010)|SHOWWINDOW(0x0040)|NOOWNERZORDER(0x0200)
    # SWP_NOZORDER is 0x0004 and MUST NOT be set here: hWndInsertAfter=HWND_BOTTOM(1)
    # is what actually sinks the window, and NOZORDER would silently discard it.
    # (The old 0x020F contained 0x0004 -> z-order never changed, so the degraded
    #  path stayed stuck on top, and it lacked NOACTIVATE -> stole focus.)
    # SWP_SHOWWINDOW is REQUIRED here, not cosmetic: this runs BEFORE the JS calls
    # win.show() (see enableWallpaper), so the window is still hidden at this point.
    # Measured on real Win32 windows: sink a hidden window without SHOWWINDOW, then
    # ShowWindow(SW_SHOW) -> z-order jumps back to TOP (the window covers the desktop
    # again, while the UI still says "degraded to bottom"). With SHOWWINDOW the sink
    # and the show happen in the SAME call, so the later show() is a no-op and the
    # window stays at the bottom. See .agent-runs/.../implementer-report-fix2.md S-10.
    [WinApi]::SetWindowPos($child, [IntPtr]1, 0, 0, $SCREEN_W, $SCREEN_H, 0x0253) | Out-Null
    $done = "OK strategy=D parent=0 progman=$($prog.ToString()) iconLayer=$($iconLayer.ToString()) bg_child_workerw=$($bg.ToString()) z=bottom"
  }
  # Wallpaper Engine (class WPE*) already owns the slot -> user must exit it to see us.
  if ($strat -eq 'A') {
    # Prefer an actual wallpaper-engine window as the reported occupier; otherwise fall
    # back to the first descendant that is not us (Chromium also parents its own
    # "Intermediate D3D Window" helper under us, which would be a misleading report).
    $occ = Find-DescendantLike $bg 'WPE'
    if ($occ -eq [IntPtr]::Zero) { $occ = Find-FirstDescendant $bg $child }
    $occCls = ''
    if ($occ -ne [IntPtr]::Zero) { $occCls = Get-Class $occ }
    if ($occCls -like '*WPE*') {
      $done += " WARN=wpe-present occupier=$($occ.ToString()) occupier_class=$occCls"
    } elseif ($occ -ne [IntPtr]::Zero) {
      $done += " WARN=slot-occupied occupier=$($occ.ToString()) occupier_class=$occCls"
    }
  }
  Write-Output $done
}
elseif ($action -eq 'disable') {
  Make-TopLevel $child | Out-Null
  [WinApi]::SetParent($child, [IntPtr]::Zero) | Out-Null
  # 0x0233 = NOSIZE(0x0001)|NOMOVE(0x0002)|NOACTIVATE(0x0010)|FRAMECHANGED(0x0020)|NOOWNERZORDER(0x0200)
  # The old 0x0230 lacked NOSIZE|NOMOVE, so the window was resized to 0x0 at (0,0) on exit.
  [WinApi]::SetWindowPos($child, [IntPtr]0, 0, 0, 0, 0, 0x0233) | Out-Null
  Write-Output "OK disabled parent=$([WinApi]::GetParent($child).ToString())"
}
elseif ($action -eq 'bottom') {
  # 0x0253 = NOSIZE(0x0001)|NOMOVE(0x0002)|NOACTIVATE(0x0010)|SHOWWINDOW(0x0040)|NOOWNERZORDER(0x0200)
  # SWP_NOZORDER = 0x0004 is deliberately absent: hWndInsertAfter = HWND_BOTTOM(1)
  # only takes effect when the z-order is actually allowed to change.
  # SWP_SHOWWINDOW is REQUIRED, not cosmetic: enableWallpaper calls runPs(...,'bottom')
  # and only then safe(win,'show'), so the window is still hidden here. Measured on
  # real Win32 windows: sink a hidden window without SHOWWINDOW, then show it -> the
  # z-order jumps back to TOP. With SHOWWINDOW the sink and the show are one atomic call.
  [WinApi]::SetWindowPos($child, [IntPtr]1, 0, 0, 0, 0, 0x0253) | Out-Null
  Write-Output "OK bottom"
}
elseif ($action -eq 'top') {
  # 0x0043 = NOSIZE|NOMOVE|SHOWWINDOW (no NOZORDER -> HWND_TOP really raises)
  [WinApi]::SetWindowPos($child, [IntPtr]0, 0, 0, 0, 0, 0x0043) | Out-Null
  Write-Output "OK top"
}
elseif ($action -eq 'diag') {
  # Full diagnostic report: the user can paste this straight back to the AI.
  $cv = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
  $lines = @()
  $lines += ('BUILD=' + $cv.CurrentBuild + '.' + $cv.UBR + ' (' + $cv.DisplayVersion + ')')
  $gs = [WinApi]::GetShellWindow()
  # Report BOTH lookups: the title-based one is 0 on non-English Windows (the title
  # is localized), the class-based one is what Get-Progman actually falls back to.
  $pt = [WinApi]::FindWindowW('Progman', 'Program Manager')
  $pc = [WinApi]::FindWindowExW([IntPtr]::Zero, [IntPtr]::Zero, 'Progman', $null)
  $lines += ('GETSHELL=' + $gs.ToString() + ' class=' + (Get-Class $gs) + ' title=' + (Get-Title $gs))
  $lines += ('PROGVIA_TITLE=' + $pt.ToString() + ' (0 expected on non-English Windows)')
  $lines += ('PROGVIA_CLASS=' + $pc.ToString())
  $prog = Get-Progman
  $lines += ('PROGMAN=' + $prog.ToString() + ' hasDefView=' + (Has-DefView $prog))
  $lines += ('ICONLAYER=' + (Pick-IconLayer $prog).ToString())
  $bgw = Pick-BackgroundWorkerW $prog
  $lines += ('BG_CHILD_WORKERW=' + $bgw.ToString())
  if ($bgw -ne [IntPtr]::Zero) {
    $occ = Find-DescendantLike $bgw 'WPE'
    if ($occ -eq [IntPtr]::Zero) { $occ = Find-FirstDescendant $bgw $child }
    $lines += ('BG_OCCUPIER=' + $(if ($occ -ne [IntPtr]::Zero) { $occ.ToString() } else { 'none' }) +
               ' class=' + $(if ($occ -ne [IntPtr]::Zero) { Get-Class $occ } else { 'none' }) +
               ' wpe=' + [bool](Find-DescendantLike $bgw 'WPE'))
  }
  # direct children of Progman, for eyeballing the desktop layer tree
  $lines += 'PROGMAN_CHILDREN:'
  if ($prog -ne [IntPtr]::Zero) {
    $kids = New-Object System.Collections.ArrayList
    $script:kids = $kids
    $cb = [WinApi+EWP] {
      param($h,$l)
      $script:kids.Add(('  hwnd=' + $h.ToString() + ' class=' + (Get-Class $h) +
                       ' visible=' + [WinApi]::IsWindowVisible($h) +
                       ' hasDefView=' + (Has-DefView $h))) | Out-Null
      return $true
    }
    [WinApi]::EnumChildWindows($prog, $cb, [IntPtr]::Zero) | Out-Null
    foreach ($k in $script:kids) { $lines += $k }
  }
  $ws = @(Get-TopWorkerWList)
  $lines += ('WORKERW_COUNT=' + $ws.Count + ' (top-level only, diagnostic)')
  $i = 0
  foreach ($w in $ws) {
    $lines += ('  top#' + $i + ' hwnd=' + $w.ToString() + ' visible=' + [WinApi]::IsWindowVisible($w) +
               ' DefView=' + $(if (Has-DefView $w) { 'yes' } else { 'none' }))
    $i++
  }
  if ($child -ne [IntPtr]::Zero) {
    $lines += ('CHILD hwnd=' + $child.ToString() + ' parent=' + [WinApi]::GetParent($child).ToString() +
               ' style=0x' + ('{0:X8}' -f ([int64][WinApi]::GetWindowLongW($child, $GWL_STYLE) -band 0xFFFFFFFF)) +
               ' visible=' + [WinApi]::IsWindowVisible($child))
  } else {
    $lines += 'CHILD=(none)'
  }
  $lines += ('DESKTOP_WIN=' + [WinApi]::GetDesktopWindow().ToString())
  Write-Output ($lines -join [Environment]::NewLine)
}
else { Write-Output "FAIL unknown-action" }
`;

const PS_ACTIONS = ['enable', 'disable', 'bottom', 'top', 'diag'];
function runPs(childHwnd, action) {
  const hwnd = /^\d+$/.test(String(childHwnd)) ? String(childHwnd) : '0';
  const act = PS_ACTIONS.includes(action) ? action : 'fail';
  const { width, height } = getScreenSize();
  // $SCREEN_W / $SCREEN_H (not $W / $H): PowerShell variable names are
  // case-insensitive, so short names get shadowed by same-letter locals/params
  // inside the script's functions ($h, $w). Long names cannot collide.
  const script = `$child = [IntPtr]::new([long]${hwnd})\n$action = '${act}'\n$SCREEN_W = ${Math.round(width)}\n$SCREEN_H = ${Math.round(height)}\n` + PS_BODY;
  return new Promise((resolve) => {
    execFile('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
      { windowsHide: true, timeout: 30000, maxBuffer: 1 << 20 },
      (err, stdout, stderr) => {
        if (err) {
          // ASCII-only console output: PS stderr bytes are GBK and would be mojibake.
          console.warn('[wallpaper] powershell(' + act + ') error:', err.message);
          psLog('WALLPAPER_PS_ERROR action=' + act + ' msg=' + err.message + ' stderr=' + String(stderr || '').trim().slice(0, 2000));
          resolve('FAIL ps-error');
        } else {
          const se = String(stderr || '').trim();
          if (se) { console.warn('[wallpaper] ps stderr -> (see ' + PS_LOG + ')'); psLog('WALLPAPER_PS_STDERR action=' + act + ' stderr=' + se.slice(0, 2000)); }
          resolve(String(stdout || '').trim());
        }
      });
  });
}

/* 进入壁纸模式：挂到桌面背景层（图标层之下）+ 不占任务栏
   这里【不】开启整窗点击穿透——挂到背景层后窗口本就在桌面图标之下，不挡其他应用；
   整窗穿透会让界面完全无法交互。穿透交由渲染层按鼠标位置动态控制。 */
async function enableWallpaper(win) {
  const { width, height } = getScreenSize();
  safe(win, 'setBounds', { x: 0, y: 0, width, height });
  safe(win, 'setSkipTaskbar', true);
  safe(win, 'setIgnoreMouseEvents', false);

  if (!isWindows()) {
    safe(win, 'show');
    return { ok: false, reason: '非 Windows 平台，保持普通窗口' };
  }

  const r = await runPs(hwndString(win), 'enable');
  if (typeof r === 'string' && r.startsWith('OK')) {
    // strategy=D means A/B/C all failed to parent us and we only sank to the bottom of the
    // z-order as a top-level window (parent=0). It starts with "OK" because the window IS
    // usable, but we are NOT in the wallpaper layer -- reporting ok:true here would show
    // "已挂入桌面背景层" with parent=0 as the proof, which is exactly backwards. Report it as
    // a failure so main.js runs the full diagnostic + writes the report + surfaces the reason.
    if (/\bstrategy=D\b/.test(r)) {
      console.warn('[wallpaper] attach degraded (not in wallpaper layer):', r);
      safe(win, 'show');
      return { ok: false, degraded: true, reason: r };
    }
    // 挂成子窗口后 Electron 内部几何缓存会与实际不符，强制同步一次
    safe(win, 'setBounds', { x: 0, y: 0, width, height });
    safe(win, 'show');
    console.log('[wallpaper] attach OK ->', r);
    return { ok: true, detail: r, wpe: /WARN=wpe-present/.test(r) };
  }

  console.warn('[wallpaper] attach failed:', r);
  await runPs(hwndString(win), 'bottom');
  safe(win, 'show');
  return { ok: false, reason: r };
}

/* 退出壁纸模式：改回顶层 + SetParent(NULL) + 置前 */
async function disableWallpaper(win) {
  if (isWindows()) {
    await runPs(hwndString(win), 'disable');
    await runPs(hwndString(win), 'top');
  }
  safe(win, 'setSkipTaskbar', false);
  safe(win, 'setIgnoreMouseEvents', false);
  safe(win, 'show');
  console.log('[wallpaper] 已退出壁纸模式');
}

/* 诊断：探测当前桌面 WorkerW 结构。
   传入 win（或 hwnd 字符串）可顺带报告该窗口的父窗口与样式位，用于验证挂入结果。 */
function probeWallpaper(win) {
  let h = '0';
  if (typeof win === 'string' || typeof win === 'number') h = String(win);
  else if (win) h = hwndString(win);
  return runPs(h, 'diag');
}

module.exports = { enableWallpaper, disableWallpaper, isWindows, probeWallpaper };
