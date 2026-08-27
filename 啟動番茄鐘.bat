@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing required files. Please wait...
  call npm.cmd install
  if errorlevel 1 (
    echo Installation failed. Please check Node.js and your internet connection.
    pause
    exit /b 1
  )
)

start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0main.js"
endlocal
