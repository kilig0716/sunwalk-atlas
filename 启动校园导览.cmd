@echo off
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 goto usepython
py -3 "%~dp0serve.py"
goto done
:usepython
python "%~dp0serve.py"
:done
if errorlevel 1 pause
