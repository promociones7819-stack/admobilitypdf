#!/bin/zsh
set -e
cd "${0:A:h}"

if [[ "$(uname -s)" == "Darwin" ]]; then
  # Si se ha autorizado con clic derecho > Abrir, evita que Gatekeeper vuelva a preguntar.
  xattr -d com.apple.quarantine "$0" 2>/dev/null || true
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "No se encuentra Node.js, necesario para abrir PDF Maestro."
  echo "Instálalo desde https://nodejs.org y vuelve a abrir este archivo."
  read "?Pulsa Intro para cerrar…"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Preparando PDF Maestro por primera vez…"
  npm install
fi

echo "PDF Maestro se abrirá en tu navegador."
echo "Mantén esta ventana abierta mientras uses la aplicación."
npm run local
