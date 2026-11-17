@echo off
chcp 65001 >nul
title QSLink · QSL 卡片交换站
cd /d "%~dp0"
echo.
echo   QSLink · QSL 卡片交换站
echo   ------------------------------------
echo   正在构建前端并启动服务...
echo   访问地址: http://127.0.0.1:8787
echo   停止服务: 关闭本窗口或按 Ctrl+C
echo.
call npm run build
if errorlevel 1 (
  echo 前端构建失败，请查看上方错误。
  pause
  exit /b 1
)
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8787'"
call npm start
pause
