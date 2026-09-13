@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo   orbis - the world economic calendar on a globe
echo   ----------------------------------------------
echo.

rem --- Locate Python (no packages required, standard library only) ----------
rem The launcher first: `where python` also matches the Windows Store stub,
rem which is on PATH by default and exits without running anything. `py -3`
rem resolves a real installation when there is one.
set "PY="
where py >nul 2>&1 && set "PY=py -3"
if not defined PY ( where python >nul 2>&1 && set "PY=python" )

if not defined PY (
  echo   [x] Python 3 was not found on your PATH.
  echo       Install it from https://www.python.org/downloads/
  echo       and tick "Add python.exe to PATH" during setup.
  echo.
  pause
  exit /b 1
)

rem --- Globe geometry: generated once, then cached in assets/ ---------------
rem Both files or neither: the globe needs the dot matrix and the outlines, and
rem checking only one of them let a working copy that had lost land-dots.json
rem report "geometry cached" and then draw a planet with no land on it.
if not exist "assets\land-dots.json" set "NEEDGEO=1"
if not exist "assets\borders.json" set "NEEDGEO=1"
if defined NEEDGEO (
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
echo   [x] Something went wrong above.
echo.
echo       The first run needs an internet connection: it downloads
echo       public-domain map data and the economic calendar, neither of
echo       which is committed to this repository. Check your connection
echo       ^(and any proxy or firewall^) and try again.
echo.
rem Only offer `offline` when there is actually something to serve. Suggesting
rem it on a first run sends the reader to a command that cannot work yet.
if exist "data\calendar.json" if exist "assets\land-dots.json" (
  echo       You already have data from a previous run. To use it:
  echo         start.bat offline
  echo.
)
pause
exit /b 1
