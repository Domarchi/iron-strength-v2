# Iconos de tienda · borradores

Exportaciones de la mancuerna existente de src/lib/pwa/icon-art.tsx, con los mismos colores y proporciones. Se dibujan desde SVG; no amplían el PNG de 512 px del preview ni incorporan fuentes, fotografías o imágenes generadas.

| Archivo           | Dimensiones         | Formato               | Uso propuesto                                 |
| ----------------- | ------------------- | --------------------- | --------------------------------------------- |
| icon-source.svg   | Vector, viewBox 512 | SVG editable          | Fuente reproducible de la marca.              |
| app-icon-1024.png | 1024 × 1024         | PNG RGB opaco         | Base para el catálogo de iconos de Apple.     |
| play-icon-512.png | 512 × 512           | PNG RGBA, fondo opaco | Ficha de Google Play, con esquinas cuadradas. |

Desde la raíz: `node docs/store-release/generate-icons.mjs`. Usa Sharp y Prettier ya instalados; comprueba dimensiones y canales al exportar. Se revisaron ambas dimensiones y la vista de 1024 px. El fuente móvil anterior es 512 px RGBA con alfa totalmente opaco; estos archivos no cambian el icono de ningún binario verificado.

Apple permite generar variaciones de iconos desde una imagen de 1024 px en su catálogo; la elección final de catálogo/composición se contrasta con Xcode y la consola al preparar el envío. [Configuración oficial](https://developer.apple.com/documentation/xcode/configuring-your-app-icon). Google especifica 512 px, PNG de 32 bits y no incorporar al dibujo el redondeo aplicado por la tienda. [Especificación oficial](https://developer.android.com/distribute/google-play/resources/icon-design-specifications), [recursos de la ficha](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en-GB). Fuentes revisadas el 25 de octubre de 2026.

Estado: candidatos locales, sin subir a tiendas ni conectar al perfil production. Al preparar la publicación, usar los recursos revisados, confirmar identificadores y reconstruir/verificar el artefacto firmado. No sustituir archivos dentro de un APK ya probado. Los [candidatos de capturas Android y gráfico de presentación](google-play/README.md) se prepararon por separado; capturas finales iPhone/Android y aprobación de la ficha siguen pendientes. Este icono no las reemplaza.
