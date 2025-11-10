@echo off
setlocal
chcp 65001 >nul

REM ====== MÓD VÁLASZTÁS ARGUMENTUM ALAPJÁN ======
if /I "%1"=="backend"  goto backend_mode
if /I "%1"=="frontend" goto frontend_mode
goto main_launcher


REM ------------------------------------------------
REM  FŐ LAUNCHER (paraméter nélkül hívva)
REM ------------------------------------------------
:main_launcher
title LLM Developer Environment
echo =====================================
echo    LLM Developer Environment Start
echo =====================================
echo.

set "ROOT=%~dp0"
pushd "%ROOT%"

REM -- Python ellenőrzése --
where python >nul 2>nul
if errorlevel 1 (
    echo [X] Python nincs telepítve vagy nincs a PATH-ban!
    pause
    goto :eof
)

REM -- Virtualenv ellenőrzése / létrehozása --
if not exist "backend\venv\Scripts\activate.bat" (
    echo [*] Nincs virtualenv, létrehozás: python -m venv backend\venv
    python -m venv backend\venv
)

if exist "backend\venv\Scripts\activate.bat" (
    echo [1/4] Virtualenv megtalálva / létrehozva.
) else (
    echo [X] Nem sikerült létrehozni a virtualenv-et!
    pause
    goto :eof
)

REM -- Backend ablak indítása --
echo [2/4] Backend ablak indítása...
start "Backend" "%~f0" backend

REM -- Frontend ablak indítása --
echo [3/4] Frontend ablak indítása...
start "Frontend" "%~f0" frontend

echo.
echo [4/4] Parancsok elküldve a külön ablakoknak.
echo     Backend:  http://localhost:8000
echo     Frontend: http://localhost:5173
echo -------------------------------------
pause
goto :eof


REM ------------------------------------------------
REM  BACKEND MÓD
REM ------------------------------------------------
:backend_mode
title Backend
cd /d "%~dp0backend"

echo [Backend] Mappa: %CD%

echo [Backend] Virtualenv aktiválása...
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else (
    echo [Backend] NINCS venv\Scripts\activate.bat - globális Python kerül használatra.
)

REM -- pip install, ha van requirements.txt --
if exist requirements.txt (
    echo [Backend] pip install -r requirements.txt
    pip install -r requirements.txt
) else (
    echo [Backend] Nincs requirements.txt, pip install kihagyva.
)

REM -- log könyvtár (ha kell majd) --
if not exist logs (
    mkdir logs
)

echo [Backend] Uvicorn indítása...
echo [Backend] (Ctrl+C-vel tudod leállítani ezt az ablakot.)
REM Itt már a backend mappában vagyunk, ezért az app.main:app az import útvonal
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
goto :eof


REM ------------------------------------------------
REM  FRONTEND MÓD
REM ------------------------------------------------
:frontend_mode
title Frontend
cd /d "%~dp0frontend"

echo [Frontend] Mappa: %CD%

REM -- log könyvtár (ha kell) --
if not exist logs (
    mkdir logs
)

REM -- npm install, ha nincs node_modules --
if not exist node_modules (
    echo [Frontend] node_modules hiányzik, npm install fut...
    npm install
) else (
    echo [Frontend] node_modules létezik, npm install kihagyva.
)

echo [Frontend] Vite indítása...
echo [Frontend] (Ctrl+C-vel tudod leállítani ezt az ablakot.)
npm run dev -- --host 0.0.0.0 --port 5173
goto :eof
