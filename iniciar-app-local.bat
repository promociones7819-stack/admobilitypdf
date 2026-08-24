@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Preparando PDF Maestro por primera vez...
  call npm install
)
echo PDF Maestro se abrira en tu navegador.
echo Manten esta ventana abierta mientras uses la aplicacion.
call npm run local
