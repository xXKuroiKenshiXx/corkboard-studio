@echo off
chcp 65001 >NUL
title Corkboard Studio (web)
cd /d "%~dp0"

rem Corkboard Studio - version web en http://localhost:5173
rem (la app de escritorio se descarga de Releases o se compila a mano: ver README)

rem acomoda la carpeta de GitHub Actions si quedo como _github
if exist _github (
  xcopy /E /I /Y _github .github >NUL
  rmdir /S /Q _github
)

where node >NUL 2>NUL
if errorlevel 1 (
  echo.
  echo   Falta Node.js. Instalalo desde https://nodejs.org o con:
  echo     winget install OpenJS.NodeJS.LTS
  echo.
  pause
  exit /b 1
)

echo Verificando dependencias...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo.
  echo   Fallo la instalacion de dependencias. Revisa tu conexion a internet.
  echo.
  pause
  exit /b 1
)

echo.
echo   Corkboard Studio en http://localhost:5173
echo   Cerra esta ventana para detenerlo.
echo.
call npm run dev
pause
