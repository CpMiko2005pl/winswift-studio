@echo off
setlocal
title WinSwift Studio - instalacja
set "SRC=%~dp0"
set "DEST=%LOCALAPPDATA%\Programs\WinSwift Studio"

if not exist "%SRC%WinSwift Studio.exe" (
  echo Najpierw rozpakuj cale archiwum ZIP, potem uruchom Zainstaluj.bat z rozpakowanego folderu.
  pause
  exit /b 1
)

echo Instaluje WinSwift Studio do:
echo   %DEST%
echo.
taskkill /IM "WinSwift Studio.exe" /F >nul 2>&1
robocopy "%SRC%." "%DEST%" /E /NFL /NDL /NJH /NJS /NP >nul
if %ERRORLEVEL% GEQ 8 (
  echo Blad kopiowania plikow.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$d = $env:DEST; $s = New-Object -ComObject WScript.Shell;" ^
  "foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {" ^
  "  $l = $s.CreateShortcut((Join-Path $dir 'WinSwift Studio.lnk'));" ^
  "  $l.TargetPath = Join-Path $d 'WinSwift Studio.exe'; $l.WorkingDirectory = $d;" ^
  "  $l.IconLocation = (Join-Path $d 'resources\app\build\icon.ico') + ',0';" ^
  "  $l.Description = 'WinSwift Studio - aplikacje na iPhone w Swift na Windows'; $l.Save() }"

echo Gotowe! Skroty "WinSwift Studio" sa na pulpicie i w menu Start.
echo.
where swift >nul 2>&1
if errorlevel 1 (
  echo Nie znaleziono kompilatora Swift. Zeby uruchamiac kod, kliknij dwa razy
  echo "Zainstaluj-Swift-i-narzedzia.bat" - instrukcja w INSTRUKCJA.txt.
  echo.
)
start "" "%DEST%\WinSwift Studio.exe"
pause
