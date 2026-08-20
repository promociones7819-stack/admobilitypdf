PUBLICACION FLIPBOOK
====================

Esto NO es un PDF para Acrobat: es una aplicacion web local completa.
El archivo document.pdf se usa unicamente como fuente para PDF.js dentro
del visor flipbook. No lo abras con Acrobat: no veras el efecto de paginas.

COMO ABRIRLO (recomendado)
--------------------------
1. Descomprime el ZIP.
2. Abre una terminal en la carpeta "flipbook".
3. Ejecuta:  npm install
4. Ejecuta:  npm run start
5. Abre en el navegador la direccion que muestra la terminal:
   http://localhost:8080
   (si el puerto esta ocupado, el servidor usa el siguiente libre y lo indica)

No hace falta internet ni instalar dependencias: el servidor solo usa Node.js
y "npm install" no descarga nada (no hay dependencias externas).

ALTERNATIVA SIN NODE.JS
-----------------------
  Windows        -> doble clic en iniciar-windows.bat
  macOS / Linux  -> doble clic en iniciar-mac-linux.command
  o bien:  python3 -m http.server 8080

POR QUE NO FUNCIONA CON DOBLE CLIC EN index.html
------------------------------------------------
Con el protocolo file:// los navegadores bloquean la lectura de archivos
locales (PDF, JSON y workers), asi que el visor no puede arrancar. Usa el
servidor local incluido; sigue siendo 100% local y sin internet.

CONTENIDO
---------
  index.html         Visor flipbook (punto de entrada)
  document.pdf       PDF original, sin modificar
  hotspots.json      Hotspots interactivos del editor
  bookmarks.json     Indice / marcadores del PDF
  assets/            viewer.js y styles.css
  libs/              pdf.js y StPageFlip (copias locales)
  server.mjs         Servidor local (solo Node.js)
  package.json       Define "npm run start"

FUNCIONES DEL VISOR
-------------------
  efecto de pasar paginas, indice/bookmarks, hotspots, enlaces internos,
  enlaces externos, boton "Menu", zoom, pantalla completa y navegacion.

Esta carpeta se puede copiar a otro ordenador o a un USB y seguira
funcionando igual, sin conexion.
