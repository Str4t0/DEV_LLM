@echo off
setlocal
chcp 65001 >nul

REM ====== MOD VALASZTAS ARGUMENTUM ALAPJAN ======
if /I "%1"=="backend"  goto backend_mode
if /I "%1"=="frontend" goto frontend_mode
goto main_launcher


REM ------------------------------------------------
REM  FO LAUNCHER (parameter nelkul hivva)
REM ------------------------------------------------
:main_launcher
title LLM Developer Environment
echo =====================================
echo    LLM Developer Environment Start
echo =====================================
echo.

set "ROOT=%~dp0"
pushd "%ROOT%"

REM -- Python ellenorzese --
where python >nul 2>nul
if errorlevel 1 (
    echo [X] Python nincs telepitve vagy nincs a PATH-ban!
    pause
    goto :eof
)

REM -- Virtualenv ellenorzese / letrehozasa --
if not exist "backend\venv\Scripts\activate.bat" (
    echo [*] Nincs virtualenv, letrehozas: python -m venv backend\venv
    python -m venv backend\venv
)

if exist "backend\venv\Scripts\activate.bat" (
    echo [1/4] Virtualenv megtalalva / letrehozva.
) else (
    echo [X] Nem sikerult letrehozni a virtualenv-et!
    pause
    goto :eof
)

REM -- Backend ablak inditasa --
echo [2/4] Backend ablak inditasa...
start "Backend" "%~f0" backend

REM -- Frontend ablak inditasa --
echo [3/4] Frontend ablak inditasa...
start "Frontend" "%~f0" frontend

echo.
echo [4/4] Parancsok elkuldve a kulon ablakoknak.
echo     Backend:  http://localhost:5172
echo     Frontend: http://localhost:5173
echo -------------------------------------
pause
goto :eof


REM ------------------------------------------------
REM  BACKEND MOD
REM ------------------------------------------------
:backend_mode
title Backend
cd /d "%~dp0backend"

echo [Backend] Mappa: %CD%

echo [Backend] Virtualenv aktivalasa...
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else (
    echo [Backend] NINCS venv\Scripts\activate.bat - globalis Python kerul hasznalatra.
)

REM -- pip install, ha van requirements.txt --
if exist requirements.txt (
    echo [Backend] pip install -r requirements.txt
    pip install -r requirements.txt
) else (
    echo [Backend] Nincs requirements.txt, pip install kihagyva.
)

REM -- log konyvtar (ha kell majd) --
if not exist logs (
    mkdir logs
)

echo [Backend] Uvicorn inditasa...
echo [Backend] (Ctrl+C-vel tudod leallitani ezt az ablakot.)
uvicorn app.main:app --reload --host 0.0.0.0 --port 5172
goto :eof


REM ------------------------------------------------
REM  FRONTEND MOD
REM ------------------------------------------------
:frontend_mode
title Frontend
cd /d "%~dp0frontend"

echo [Frontend] Mappa: %CD%

REM -- log konyvtar (ha kell) --
if not exist logs (
    mkdir logs
)

REM -- npm install, ha nincs node_modules --
if not exist node_modules (
    echo [Frontend] node_modules hianyzik, npm install fut...
    npm install
) else (
    echo [Frontend] node_modules letezik, npm install kihagyva.
)

echo [Frontend] Vite inditasa...
echo [Frontend] (Ctrl+C-vel tudod leallitani ezt az ablakot.)
npm run dev -- --host 0.0.0.0 --port 5173
goto :eof
