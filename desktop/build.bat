@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM MS Accounting Desktop Builder — Windows
REM Double-click to run, or:  cd ms-accounting && desktop\build.bat
REM ─────────────────────────────────────────────────────────────────────────────
setlocal enabledelayedexpansion

set ROOT=%~dp0..
set DESKTOP=%ROOT%\desktop
set BACKEND=%ROOT%\backend

echo ══════════════════════════════════════════
echo  MS Accounting Desktop Build (Windows)
echo ══════════════════════════════════════════

REM ── Step 1: Python backend ─────────────────────────────────────────────────
echo.
echo [1/4] Installing Python dependencies...
pip install -q pyinstaller
pip install -q -r "%BACKEND%\requirements.txt"

echo [2/4] Building Python backend with PyInstaller...
cd /d "%ROOT%"
pyinstaller "%DESKTOP%\ms-accounting.spec" ^
    --distpath "%DESKTOP%\backend-dist" ^
    --workpath "%DESKTOP%\build-tmp" ^
    --noconfirm

if %ERRORLEVEL% neq 0 (
    echo ERROR: PyInstaller failed. Check output above.
    pause & exit /b 1
)
echo OK - Backend built.

REM ── Step 2: Icons ──────────────────────────────────────────────────────────
echo.
echo [3/4] Generating icons...
python "%DESKTOP%\make_icons.py" 2>nul || echo (Icon generation skipped)

REM ── Step 3: Electron app ───────────────────────────────────────────────────
echo.
echo [4/4] Building Electron app...
cd /d "%DESKTOP%\electron"

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js not found. Download from https://nodejs.org/
    pause & exit /b 1
)

call npm install --silent
call npm run build:win

echo.
echo ══════════════════════════════════════════
echo  Build complete!
echo  Installer: dist\MS Accounting Setup.exe
echo ══════════════════════════════════════════
pause
