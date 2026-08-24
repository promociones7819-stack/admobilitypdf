#!/bin/zsh
set -e
cd "${0:A:h}"

if [ ! -d node_modules ]; then
  echo "Preparando PDF Maestro por primera vez…"
  npm install
fi

echo "PDF Maestro se abrirá en tu navegador."
echo "Mantén esta ventana abierta mientras uses la aplicación."
npm run local
