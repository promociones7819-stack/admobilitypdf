FLIPBOOK - COMO ABRIRLO
=======================

Para Windows: doble clic en iniciar-windows.bat.
Para macOS/Linux: clic derecho en iniciar-mac-linux.command > Abrir.

Si macOS indica que faltan privilegios, abre Terminal, escribe "chmod +x "
(con el espacio final), arrastra iniciar-mac-linux.command a Terminal y pulsa
Intro. Después vuelve a usar clic derecho > Abrir.

Se abrira el navegador con el flipbook funcionando.

Requisito unico: tener Python 3 instalado (gratis):
https://www.python.org/downloads/
En Windows, marca "Add Python to PATH" al instalarlo.

No hace falta internet, Node.js ni npm. Todo esta incluido en esta carpeta.
El archivo document.pdf lo carga PDF.js dentro del flipbook: no lo abras con
Acrobat, no veras el efecto de paginas.

Contenido:
  index.html         Visor flipbook (punto de entrada)
  document.pdf       PDF original, sin modificar
  hotspots.json      Hotspots interactivos del editor
  bookmarks.json     Indice / marcadores del PDF
  assets/            viewer.js y styles.css
  libs/              pdf.js y StPageFlip (copias locales)
  servidor.py        Servidor local (solo Python estandar)

Esta carpeta se puede copiar a otro ordenador o a un USB y seguira
funcionando igual, sin conexion.
