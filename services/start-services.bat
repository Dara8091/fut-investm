@echo off
REM fut.invest - Start Python Services
cd /d "%~dp0"

echo ========================================
echo fut.invest - Python Services
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python no esta instalado. Instalar Python 3.10+
    pause
    exit /b 1
)

REM Install dependencies if needed
if not exist ".venv" (
    echo Creando entorno virtual...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    pip install -e .
) else (
    call .venv\Scripts\activate.bat
)

echo.
echo Iniciando servicios Python en puerto 3002...
echo.

python -m uvicorn main:app --host 0.0.0.0 --port 3002 --reload
