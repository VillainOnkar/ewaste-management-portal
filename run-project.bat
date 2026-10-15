@echo off
setlocal
cd /d "%~dp0"

echo Starting E-Waste Management Portal...

netstat -ano | findstr ":5000" | findstr "LISTENING" >nul
if errorlevel 1 (
    echo Starting backend...
    start "E-Waste Backend" /D "%~dp0server" cmd /k "npm run dev"
)

netstat -ano | findstr ":5173" | findstr "LISTENING" >nul
if errorlevel 1 (
    echo Starting frontend...
    start "E-Waste Frontend" /D "%~dp0client" cmd /k "npm run dev"
)

echo Waiting for the services to start...
powershell -NoProfile -Command "Start-Sleep -Seconds 5"
echo Opening the project in your browser...
start "" "http://localhost:5173"
exit /b 0
