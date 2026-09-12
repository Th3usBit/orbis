@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo   orbis - the world economic calendar on a globe
echo   ----------------------------------------------
echo.

rem --- Locate Python (no packages required, standard library only) ----------
set "PY="
where python >nul 2>&1 && set "PY=python"
if not defined PY ( where py >nul 2>&1 && set "PY=py -3" )

if not defined PY (
  echo   [x] Python 3 was not found on your PATH.
  echo       Install it from https://www.python.org/downloads/
  echo       and tick "Add python.exe to PATH" during setup.
  echo.
  pause
  exit /b 1
)

rem --- Globe geometry: generated once, then cached in assets/ ---------------
if not exist "assets\land-dots.json" (
  echo   [1/3] Building globe geometry ^(first run only^)...
  %PY% scripts\build_geometry.py || goto :failed
) else (
  echo   [1/3] Globe geometry cached.
)

rem --- Calendar data: skip with "start.bat offline" -------------------------
if /i "%~1"=="offline" (
  echo   [2/3] Offline mode - using the existing data\calendar.json.
  if not exist "data\calendar.json" (
    echo   [x] No cached data. Run start.bat once with an internet connection.
    pause
    exit /b 1
  )
) else (
  echo   [2/3] Fetching the latest economic calendar...
  %PY% scripts\fetch.py || goto :failed
)

echo   [3/3] Starting the local server...
%PY% scripts\serve.py
goto :eof

:failed
echo.
echo   [x] Something went wrong above. If it was a network error, try:
echo       start.bat offline
echo.
pause
exit /b 1
