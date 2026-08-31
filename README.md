# PDF Maestro

## Abrir la aplicación en local

En macOS, usa **clic derecho > Abrir** sobre `iniciar-app-local.command`. La aplicación se abrirá
en `http://127.0.0.1:4173`; esa dirección pertenece únicamente a tu ordenador. Consulta
`LEEME-APP-LOCAL.txt` si macOS muestra un aviso de permisos.

Los flipbooks pueden exportarse como un único archivo HTML que sí se abre directamente con doble
clic, sin servidor ni instalación.

## Funciones integradas

- Editor PDF completo con organización de páginas, anotaciones, imágenes, firmas, búsqueda y
  censura permanente.
- Compresión antes y después de editar, combinación, división, extracción y conversión de PDF a
  JPG, además de JPG, HEIC, Word, PowerPoint y Excel a PDF.
- OCR por rangos y en siete idiomas, con orientación automática y capa de texto posicionada.
- Constructor local de cuestionarios con preguntas y opciones ordenables, importación desde PDF,
  soluciones, copias editables, autocorrección en lectores compatibles y exportación como formulario
  PDF rellenable o como HTML autocorregible universal.
- Marcas de agua, cabeceras, pies, numeración Bates, QR y limpieza de metadatos.
- Comparación de dos PDF por texto y por imagen, procesamiento por lotes y auditoría de estructura,
  accesibilidad y señales PDF/A.
- Protección AES-256 con permisos y firma digital mediante certificado P12/PFX; los certificados y
  contraseñas no se guardan.
- Flipbook local en HTML con búsqueda, índice editable, temas, sonido opcional, ventanas, vídeo,
  audio, imágenes y botones 3D configurables.
- Carpetas de proyecto locales con cambio de nombre, archivo, versiones manuales y restauración.

Todo el tratamiento principal se realiza en el navegador. Solo el primer uso de algunos idiomas OCR
puede necesitar descargar sus datos de reconocimiento.

## Publicar en Cloudflare Workers

El proyecto incluye `wrangler.jsonc` para desplegar la aplicación como SPA estática en Cloudflare
Workers. Las herramientas PDF, OCR e IA se cargan y ejecutan en el navegador, por lo que no ocupan
el límite de tamaño del Worker. Los recursos se generan en `.output/public`.

1. Instala las dependencias con `npm install`.
2. Inicia sesión una vez con `npx wrangler login`.
3. Publica con `npm run deploy:cloudflare`.

Para probar localmente el mismo runtime de Cloudflare usa `npm run preview:cloudflare`. Los archivos
PDF y los modelos de IA continúan procesándose y guardándose en el navegador del usuario; el Worker
solo entrega la aplicación.

Crea una Web App completa de edición de PDFs

Quiero crear una web app profesional para editar, organizar y anotar archivos PDF, similar en concepto a un editor PDF sencillo tipo Adobe Acrobat, pero con una interfaz mucho más limpia, moderna y fácil de usar.

IMPORTANTE: no quiero únicamente una maqueta visual. Todas las funciones principales deben ser funcionales y deben modificar/exportar realmente el PDF.

La aplicación debe funcionar principalmente en el navegador y, siempre que sea posible, procesar los archivos localmente para preservar la privacidad del usuario.

1. OBJETIVO PRINCIPAL

La aplicación debe permitir:

Abrir/importar PDFs.

Visualizar PDFs.

Navegar entre páginas.

Hacer zoom.

Reordenar páginas.

Eliminar páginas.

Duplicar páginas.

Rotar páginas.

Añadir páginas desde otro PDF.

Combinar varios PDFs.

Extraer páginas.

Dividir PDFs.

Añadir texto.

Subrayar.

Resaltar.

Tachar.

Dibujar a mano.

Añadir líneas.

Añadir flechas.

Añadir rectángulos.

Añadir círculos.

Añadir imágenes.

Añadir firma.

Deshacer/rehacer.

Descargar el PDF resultante.

El resultado descargado debe ser un PDF real y válido, no una imagen de las páginas.

2. TECNOLOGÍA

Utiliza una arquitectura moderna y mantenible.

Preferencias:

React

TypeScript

Vite

Tailwind CSS

shadcn/ui

Para PDF:

Utilizar PDF.js para renderizar y visualizar los PDFs.

Utilizar pdf-lib para manipular páginas y generar/exportar el PDF.

Utilizar una librería adecuada como Fabric.js o Konva para las anotaciones y objetos interactivos si es necesario.

No reinventes funcionalidades que estas librerías ya proporcionan.

Antes de implementar una solución propia, comprueba si PDF.js, pdf-lib o la librería de canvas seleccionada ya permite resolver correctamente el problema.

3. INTERFAZ

Crear una interfaz profesional, limpia y minimalista.

Inspiración funcional:

Adobe Acrobat

PDF24

Smallpdf

Pero NO copiar visualmente ninguna de ellas.

Quiero una interfaz propia.

La aplicación tendrá esta estructura:

┌──────────────────────────────────────────────────────────────┐
│ PDF EDITOR │
│ Abrir PDF Combinar Guardar Descargar │
├──────────────┬───────────────────────────────────────────────┤
│ │ │
│ HERRAMIENTAS │ DOCUMENTO │
│ │ │
│ Seleccionar │ │
│ Texto │ │
│ Resaltar │ │
│ Subrayar │ │
│ Tachado │ PÁGINA PDF │
│ Dibujar │ │
│ Línea │ │
│ Flecha │ │
│ Rectángulo │ │
│ Círculo │ │
│ Imagen │ │
│ Firma │ │
│ │ │
├──────────────┴───────────────────────────────────────────────┤
│ Página 1 / 20 Zoom - 100% + Rotar │
└──────────────────────────────────────────────────────────────┘

4. PANTALLA INICIAL

Al entrar en la aplicación mostrar una pantalla sencilla:

Editor PDF

"Edita, organiza y anota tus PDFs"

Botones:

Abrir PDF

Combinar PDFs

También permitir:

Arrastrar y soltar un PDF.

Seleccionar un PDF desde el dispositivo.

Cuando se cargue un documento, pasar automáticamente al editor.

5. EDITOR

El editor debe tener tres zonas principales.

A. Barra superior

Debe contener:

Logo/nombre de la aplicación.

Abrir.

Nuevo documento.

Combinar PDFs.

Deshacer.

Rehacer.

Guardar.

Descargar.

En la parte derecha:

Nombre del archivo.

Indicador de cambios sin guardar.

Ejemplo:

contrato.pdf • Cambios sin guardar

6. PANEL IZQUIERDO

Mostrar miniaturas de todas las páginas.

Cada página debe mostrar:

Número de página.

Miniatura.

Selección visual cuando esté activa.

Menú contextual.

Permitir:

Seleccionar página.

Seleccionar varias páginas.

Arrastrar para cambiar el orden.

Eliminar.

Duplicar.

Rotar.

Cuando se arrastre una página, actualizar inmediatamente el orden visual.

El orden debe coincidir con el orden final del PDF exportado.

7. ÁREA CENTRAL

Mostrar la página PDF seleccionada.

La página debe:

Mantener su proporción original.

Poder hacer zoom.

Poder desplazarse.

Mostrar correctamente las anotaciones.

Permitir seleccionar objetos.

Permitir mover objetos.

Permitir redimensionar objetos.

Muy importante:

SISTEMA DE COORDENADAS

Las anotaciones no deben depender directamente de los píxeles de pantalla.

Crear un sistema de coordenadas relativo a la página PDF.

Por ejemplo:

X = posición horizontal relativa a la página.

Y = posición vertical relativa a la página.

Width = ancho relativo.

Height = alto relativo.

De esta forma:

si hago zoom al 50%, 100%, 200% o cambio el tamaño de la ventana, la anotación debe permanecer exactamente en el mismo lugar del PDF.

Al exportar, convertir correctamente las coordenadas de la interfaz a las coordenadas reales del PDF.

Esta parte es crítica.

8. HERRAMIENTA SELECCIONAR

Herramienta:

Seleccionar

Debe permitir:

Seleccionar una anotación.

Moverla.

Redimensionarla.

Eliminarla.

Copiarla.

Pegarla.

Duplicarla.

Mostrar controles visuales alrededor del objeto seleccionado.

9. TEXTO

Herramienta:

Texto

Al hacer clic sobre una página:

Crear una caja de texto editable.

Opciones:

Tamaño.

Fuente.

Negrita.

Cursiva.

Subrayado.

Color.

Alineación.

Opacidad.

Permitir editar posteriormente el texto haciendo doble clic.

El texto debe exportarse correctamente al PDF.

10. RESALTADOR

Herramienta:

Resaltar

Permitir seleccionar una zona de texto y crear un resaltado semitransparente.

Características:

Color configurable.

Opacidad configurable.

Posibilidad de moverlo.

Posibilidad de redimensionarlo.

Posibilidad de eliminarlo.

El resaltado debe quedar correctamente situado en el PDF final.

11. SUBRAYAR

Herramienta:

Subrayar

Permitir crear una línea de subrayado.

Opciones:

Color.

Grosor.

Opacidad.

Debe poder:

Mover.

Redimensionar.

Eliminar.

12. TACHADO

Herramienta:

Tachar

Crear una línea horizontal sobre el texto.

Permitir configurar:

Color.

Grosor.

Opacidad.

13. DIBUJAR

Herramienta:

Dibujar

Permitir dibujar libremente con el ratón o pantalla táctil.

Opciones:

Color.

Grosor.

Opacidad.

El dibujo debe permanecer correctamente colocado al cambiar el zoom.

14. LÍNEA

Herramienta:

Línea

Permitir crear líneas.

Opciones:

Color.

Grosor.

Opacidad.

15. FLECHA

Herramienta:

Flecha

Crear flechas con:

Inicio.

Final.

Grosor.

Color.

Permitir mover y modificar posteriormente.

16. FORMAS

Herramientas:

Rectángulo.

Círculo.

Opciones:

Color del borde.

Grosor.

Relleno.

Opacidad.

17. IMÁGENES

Permitir:

Añadir imagen

Formatos:

PNG

JPG

JPEG

WEBP

Después de insertar una imagen permitir:

Mover.

Redimensionar.

Rotar.

Eliminar.

La imagen debe incorporarse realmente al PDF exportado.

18. FIRMA

Crear herramienta:

Firma

Permitir:

Opción 1

Dibujar firma.

Opción 2

Subir imagen de firma.

Opción 3

Escribir nombre y generar una firma visual sencilla.

Después:

Insertar firma en PDF.

Mover.

Redimensionar.

Rotar.

Eliminar.

19. GESTIÓN DE PÁGINAS

Crear un sistema sólido para gestionar páginas.

Cada página debe tener un identificador interno único.

No utilizar simplemente el número de página como ID porque el orden puede cambiar.

Operaciones:

Añadir.

Eliminar.

Duplicar.

Rotar.

Reordenar.

Ejemplo:

PDF original:

1
2
3
4
5

Si elimino la página 3:

1
2
4
5

Si muevo la 5 al principio:

5
1
2
4

El PDF descargado debe respetar exactamente ese orden.

20. COMBINAR PDFs

Crear botón:

Combinar PDFs

Permitir seleccionar varios PDFs.

Mostrar:

PDF 1

Página 1

Página 2

Página 3

PDF 2

Página 1

Página 2

Permitir reorganizar los documentos/páginas antes de combinar.

Después:

Combinar

Crear un único PDF.

21. AÑADIR PÁGINAS

Dentro del editor:

Añadir páginas

Permitir:

Añadir otro PDF.

Seleccionar qué páginas importar.

Insertarlas antes/después de la página seleccionada.

22. EXTRAER PÁGINAS

Crear opción:

Extraer páginas

Permitir seleccionar:

Una página.

Varias páginas.

Intervalo.

Ejemplo:

2-5

Crear un nuevo PDF descargable.

23. DIVIDIR PDF

Crear herramienta:

Dividir PDF

Opciones:

Cada página en un PDF.

Dividir cada X páginas.

Seleccionar rangos.

Ejemplo:

PDF de 10 páginas:

1-3
4-7
8-10

Crear los PDFs correspondientes.

Si se generan varios archivos, descargarlos agrupados en ZIP.

24. ELIMINAR PÁGINAS

Permitir:

Eliminar una página.

Eliminar varias.

Eliminar rango.

Antes de eliminar definitivamente, mostrar una confirmación si se han seleccionado varias páginas.

25. ROTAR

Permitir:

Rotar 90º derecha.

Rotar 90º izquierda.

Rotar 180º.

Puede aplicarse a:

Una página.

Varias páginas.

Todas las páginas.

La rotación debe conservarse al exportar.

26. DESHACER / REHACER

Implementar historial real de acciones.

Debe funcionar para:

Texto.

Anotaciones.

Movimiento.

Eliminación.

Inserción.

Rotación.

Reordenación.

Cambios de tamaño.

Atajos:

Ctrl + Z

Ctrl + Shift + Z

En Mac:

Cmd + Z

Cmd + Shift + Z

27. COPIAR / PEGAR

Permitir copiar y pegar anotaciones.

Atajos:

Ctrl/Cmd + C

Ctrl/Cmd + V

También:

Ctrl/Cmd + D

para duplicar.

28. ZOOM

Controles:

-

100%

-

También:

Ajustar a página.

Ajustar al ancho.

Atajos:

Ctrl/Cmd + +

Ctrl/Cmd + -

29. NAVEGACIÓN

Mostrar:

Página 1 / 24

Permitir introducir directamente el número de página.

Botones:

Anterior.

Siguiente.

También permitir:

Flecha izquierda.

Flecha derecha.

30. GUARDAR Y EXPORTAR

Botón:

Descargar PDF

Debe generar un PDF real.

Nombre por defecto:

documento-editado.pdf

Si el archivo original era:

contrato.pdf

usar:

contrato-editado.pdf

No modificar el archivo original.

31. PRIVACIDAD

Priorizar procesamiento local.

Los PDFs no deberían subirse a un servidor salvo que sea estrictamente necesario.

No guardar documentos del usuario permanentemente.

Mostrar un pequeño mensaje:

"Tu documento se procesa localmente en tu navegador."

32. RESPONSIVE

La aplicación debe funcionar en:

Ordenador.

Tablet.

Móvil.

En ordenador:

Panel de páginas + herramientas + documento.

En móvil:

Barra superior compacta.

Herramientas mediante menú.

Miniaturas mediante panel deslizable.

Área PDF maximizada.

Optimizar especialmente para pantallas táctiles.

33. EXPERIENCIA DE USUARIO

Quiero que la aplicación sea muy sencilla.

No saturar la pantalla.

Las herramientas principales deben ser fácilmente identificables.

Utilizar iconos + tooltip.

Ejemplo:

📝 Texto
🖍 Resaltar
〰 Subrayar
✏️ Dibujar
→ Flecha
▢ Rectángulo
○ Círculo
✍ Firma

Cuando se seleccione una herramienta, mostrar claramente que está activa.

34. MENÚ CONTEXTUAL DE PÁGINA

Al hacer clic derecho sobre una miniatura:

Eliminar página.

Duplicar página.

Rotar derecha.

Rotar izquierda.

Extraer página.

Añadir página antes.

Añadir página después.

35. ESTADO DE LA APLICACIÓN

Crear una estructura de estado clara.

Debe diferenciar:

Documento original

El PDF que abrió el usuario.

Estructura de páginas

Orden, eliminación, duplicación, rotación, etc.

Anotaciones

Todos los objetos creados por el usuario.

Estado del historial

Undo / Redo.

No mezclar estas responsabilidades.

36. RENDIMIENTO

La aplicación debe funcionar correctamente con PDFs grandes.

Evitar renderizar innecesariamente todas las páginas a máxima resolución.

Utilizar:

Lazy loading.

Renderizado bajo demanda.

Virtualización de miniaturas si es necesario.

El usuario debe poder abrir PDFs de muchas páginas sin que la interfaz se bloquee.

37. ERRORES

Crear mensajes claros.

Ejemplo:

"El PDF no se puede abrir."

"El archivo está protegido."

"No se ha podido exportar el PDF."

"El archivo supera el tamaño permitido."

Nunca mostrar errores técnicos directamente al usuario.

38. DISEÑO VISUAL

Estilo:

Moderno.

Profesional.

Minimalista.

Limpio.

Mucho espacio.

Bordes suaves.

Iconografía clara.

Utilizar una paleta neutra.

Preferencia:

Fondo claro.

Gris suave.

Blanco.

Texto oscuro.

Un color de acento para acciones importantes.

No utilizar colores excesivamente llamativos.

39. IMPORTANTE: NO CREAR FUNCIONES FALSAS

No quiero botones que simplemente hagan:

console.log("TODO")

ni botones que aparenten funcionar pero no hagan nada.

Si una función está visible debe funcionar.

Si alguna función avanzada no puede implementarse correctamente con la arquitectura actual, no crear una falsa implementación. Dejar la funcionalidad preparada y explicarlo claramente.

40. CRITERIOS DE ACEPTACIÓN

Consideraré que el MVP funciona correctamente si puedo hacer este flujo:

Abrir un PDF de 10 páginas.

Ver las 10 miniaturas.

Ir a la página 5.

Eliminar la página 3.

Mover la página 8 al principio.

Rotar la página 4.

Añadir texto en la página 2.

Subrayar una zona.

Resaltar otra zona.

Dibujar una flecha.

Añadir una imagen.

Insertar una firma.

Hacer zoom al 200%.

Mover una anotación.

Deshacer.

Rehacer.

Descargar el PDF.

Abrir el PDF descargado en otro visor PDF.

El PDF descargado debe conservar:

El orden correcto.

Las páginas eliminadas.

Las rotaciones.

El texto.

Las anotaciones.

Las imágenes.

La firma.

Las posiciones correctas.

41. DESARROLLO POR FASES

No intentes implementar todo de golpe.

Primero crea:

FASE 1 — MOTOR PDF

Importación.

Visualización.

Miniaturas.

Navegación.

Zoom.

Reordenación.

Eliminación.

Duplicación.

Rotación.

Exportación.

Después comprueba que funciona realmente.

FASE 2 — ANOTACIONES

Texto.

Resaltado.

Subrayado.

Tachado.

Dibujar.

Líneas.

Flechas.

Formas.

Después comprobar exportación.

FASE 3 — ELEMENTOS

Imágenes.

Firma.

FASE 4 — OPERACIONES PDF

Combinar.

Extraer.

Dividir.

FASE 5 — CALIDAD

Undo/Redo.

Copiar/Pegar.

Atajos.

Responsive.

Rendimiento.

Manejo de errores.

42. REGLA FUNDAMENTAL

Antes de terminar cada fase, prueba realmente la funcionalidad.

No des por terminada una función simplemente porque el botón aparece en pantalla.

Especialmente comprobar:

INTERFAZ → COORDENADAS → PDF FINAL

Una anotación que aparece correctamente en pantalla pero cambia de posición al descargar el PDF se considera un error.

43. PRIMER OBJETIVO

Empieza ahora construyendo la FASE 1 completa y funcional.

No añadas todavía todas las herramientas de anotación.

Primero consigue un sistema PDF sólido:

Abrir → visualizar → organizar páginas → editar estructura → exportar.

Una vez comprobado que esto funciona, continúa con la FASE 2.

Al finalizar cada fase, deja la arquitectura preparada para añadir las siguientes funciones sin tener que rehacer el proyecto.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://admobilitypdf.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3b968556-f887-49ad-a19f-380d585bbc00).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
