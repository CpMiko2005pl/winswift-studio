@echo off
title WinSwift Studio - kompilator Swift i narzedzia
echo Ten skrypt instaluje (przez winget, oficjalne paczki):
echo   1) Swift dla Windows          - bez uprawnien administratora
echo   2) Visual Studio Build Tools  - C++ (linker, biblioteki); Windows zapyta o zgode (UAC)
echo.
where winget >nul 2>&1
if errorlevel 1 (
  echo Brak programu winget. Zainstaluj "Instalator aplikacji" ze sklepu Microsoft Store
  echo albo pobierz recznie: https://www.swift.org/install/windows/
  pause
  exit /b 1
)
pause

echo.
echo === 1/2  Swift ===
winget install --id Swift.Toolchain -e --scope user --accept-package-agreements --accept-source-agreements

echo.
echo === 2/2  Visual Studio Build Tools 2022 z C++ ===
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-package-agreements --accept-source-agreements --override "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

echo.
echo Gotowe. Uruchom ponownie WinSwift Studio.
echo Jesli program nadal zglasza brak Windows SDK: menu Product - Install Windows SDK (no admin).
pause
