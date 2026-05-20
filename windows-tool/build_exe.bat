@echo off
REM Windows .exe ビルド スクリプト
REM 使い方: PowerShell or cmd で build_exe.bat を実行

setlocal

echo === MWB Excel ツール .exe ビルド ===
echo.

REM 仮想環境作成 (なければ)
if not exist venv (
    echo [1/4] 仮想環境を作成中...
    python -m venv venv || goto :error
)

echo [2/4] 依存パッケージをインストール中...
call venv\Scripts\activate.bat
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt || goto :error
pip install --quiet pyinstaller || goto :error

echo [3/4] PyInstaller で .exe を生成中...
pyinstaller ^
    --onefile ^
    --windowed ^
    --name "MWB_Excel変換" ^
    --noconfirm ^
    mwb_to_excel.py || goto :error

echo [4/4] 完了
echo.
echo 出力: dist\MWB_Excel変換.exe
echo.
pause
exit /b 0

:error
echo.
echo *** エラーが発生しました ***
pause
exit /b 1
