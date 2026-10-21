@echo off
setlocal
title WinSwift Studio - odinstalowanie
set "DEST=%LOCALAPPDATA%\Programs\WinSwift Studio"
echo Odinstalowanie WinSwift Studio (wersja z ZIP-a) z folderu:
echo   %DEST%
echo.
echo Jesli instalowales z WinSwift-Studio-Setup.exe, uzyj zamiast tego:
echo   Ustawienia - Aplikacje - Zainstalowane aplikacje - WinSwift Studio - Odinstaluj
echo.
choice /M "Odinstalowac"
if errorlevel 2 exit /b 0
taskkill /IM "WinSwift Studio.exe" /F >nul 2>&1
powershell -NoProfile -Command "Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Desktop')) 'WinSwift Studio.lnk'), (Join-Path ([Environment]::GetFolderPath('Programs')) 'WinSwift Studio.lnk') -ErrorAction SilentlyContinue"
echo.
choice /M "Usunac tez ustawienia i pamiec podreczna (lista projektow, zbudowana biblioteka SwiftUI, Windows SDK z programu)"
if errorlevel 2 goto keep
rmdir /s /q "%APPDATA%\SwiftCode" 2>nul
rmdir /s /q "%LOCALAPPDATA%\SwiftCode" 2>nul
:keep
echo.
echo Twoje projekty NIE zostaly usuniete.
echo Kompilator Swift i Visual Studio Build Tools odinstalujesz w: Ustawienia - Aplikacje.
cd /d "%TEMP%"
(goto) 2>nul & rmdir /s /q "%DEST%" & echo Odinstalowano WinSwift Studio. & pause
