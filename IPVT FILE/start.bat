@echo off
chcp 65001 >nul
title IPTV PRO - Server
color 0A

echo ========================================
echo    IPTV PRO - Starting Server
echo ========================================
echo.

REM Check if PHP is installed
where php >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] PHP is not installed or not in PATH
    echo.
    echo Please install PHP from: https://windows.php.net/download/
    echo Or use XAMPP: https://www.apachefriends.org/
    echo.
    pause
    exit /b 1
)

echo [OK] PHP found
php --version
echo.
echo Starting server on http://localhost:8000
echo Press Ctrl+C to stop the server
echo.
echo ========================================
echo.

REM Start PHP server
php -S localhost:8000

pause
