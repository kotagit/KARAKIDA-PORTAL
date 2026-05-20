@echo off
chcp 65001 > nul
setlocal

echo === MWB Excel Tool Build ===
echo.

REM Create venv if not exists
if not exist venv (
    echo [1/4] Creating virtual environment...
    python -m venv venv
    if errorlevel 1 goto :error
)

echo [2/4] Installing dependencies...
call venv\Scripts\activate.bat
python -m pip install --quiet --upgrade pip
if errorlevel 1 goto :error
python -m pip install --quiet -r requirements.txt
if errorlevel 1 goto :error
python -m pip install --quiet pyinstaller
if errorlevel 1 goto :error

echo [3/4] Building .exe with PyInstaller...
pyinstaller --onefile --windowed --name MWB_Excel_Tool --noconfirm mwb_to_excel.py
if errorlevel 1 goto :error

echo [4/4] Done.
echo.
echo Output: dist\MWB_Excel_Tool.exe
echo.
pause
exit /b 0

:error
echo.
echo *** Build failed ***
pause
exit /b 1
