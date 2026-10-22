@echo off
chcp 65001 >nul
title QSLink · QSL 卡片交换站
cd /d "%~dp0"
echo.
echo   QSLink · QSL 卡片交换站
echo   ------------------------------------
echo   正在启动服务，浏览器将在 2 秒后自动打开...
echo   访问地址: http://127.0.0.1:8787
echo   停止服务: 关闭本窗口或按 Ctrl+C
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8787'"
node server\server.js
pause
