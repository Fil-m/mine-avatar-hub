@echo off
title Mine ^& Craft Avatar Hub Launcher
chcp 65001 > nul
echo ==========================================================
echo       Mine ^& Craft Avatar Hub - Локальний Запуск
echo ==========================================================
echo.

:: Переходимо в директорію проекту
cd /d "%~dp0"

echo [1/3] Запуск Desktop Companion на порту 8989...
start "Avatar Hub Companion" py companion.py
if %errorlevel% neq 0 (
    start "Avatar Hub Companion" python companion.py
)

echo [2/3] Запуск HTTP-сервера для веб-інтерфейсу на порту 8000...
start "Avatar Hub Web Server" py -m http.server 8000
if %errorlevel% neq 0 (
    start "Avatar Hub Web Server" python -m http.server 8000
)

echo.
echo [3/3] Відкриття Mine ^& Craft Avatar Hub у вашому браузері...
timeout /t 2 /nobreak > nul
start http://127.0.0.1:8000/index.html

echo.
echo ==========================================================
echo   Сервери успішно запущені!
echo   - Веб-платформа: http://127.0.0.1:8000
echo   - Desktop Companion: http://127.0.0.1:8989
echo.
echo   Ви можете закрити це вікно. Робочі сервери залишаться
echo   активними в окремих фонових вікнах консолі.
echo ==========================================================
timeout /t 5 > nul
