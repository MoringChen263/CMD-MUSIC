@echo off
chcp 65001 >nul 2>&1
echo 正在检测 CMD-MUSIC 壁纸能力，请稍候...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify_wallpaper_real.ps1"
echo.
pause
