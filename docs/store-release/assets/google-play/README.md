# Google Play · candidatos de ficha

Cuatro composiciones Android y un gráfico de presentación, todavía sin subir. Las capturas proceden del APK quality de T202 con cuentas ficticias de la base aislada; muestran funciones reales, no el prototipo HTML. No contienen datos de alumnos reales. Son referencias de preparación, no evidencia de aprobación de la tienda.

| Archivo             | Contenido                                     | Tamaño      |
| ------------------- | --------------------------------------------- | ----------- |
| 01-home-dark.png    | Inicio y siguiente rutina, oscuro             | 1440 × 2560 |
| 02-workout.png      | Registro con objetivos por serie y superserie | 1440 × 2560 |
| 03-progress.png     | Volumen de doce semanas y acceso a resultados | 1440 × 2560 |
| 04-home-light.png   | Inicio claro con texto ampliado               | 1440 × 2560 |
| feature-graphic.png | Ilustración vectorial de presentación         | 1024 × 500  |

Todas las exportaciones son PNG RGB, sin canal alfa. Cada composición conserva los 1080 × 2400 píxeles de la captura completa, sin escala, recorte o cambios, y añade encabezado y márgenes fuera de ella. El gráfico de presentación es una ilustración, no una pantalla de la app. El texto «Datos de demostración» identifica las cuentas ficticias; el gráfico de progreso conserva sus valores reales de prueba, incluso su descenso.

## Reproducción y comprobación

Desde la raíz: `node docs/store-release/generate-google-play.mjs`. Usa Sharp y Prettier existentes y Noto Sans instalada en el sistema, sin descargar fuentes o añadir dependencias. Los originales están en source; el SVG de presentación también es editable. El generador comprueba dimensiones, canales y textos alternativos de hasta 140 caracteres. Extrae el rectángulo de interfaz y compara todos sus píxeles RGB con el original; un cambio falla la generación. manifest.json registra origen, dimensiones y SHA-256 tanto de fuentes como de exportaciones.

Se revisaron visualmente las cinco exportaciones: títulos legibles, interfaz completa y distinción entre Android, demostración e ilustración. Las barras del sistema conservan la hora y el indicador de QA de las capturas originales. Antes del envío, recapturar desde el candidato de producción con notificaciones despejadas y datos de revisión adecuados; contrastar el contenido con ese binario y la consola. No ocultar indicadores reconstruyendo la interfaz. Las capturas iPhone siguen pendientes y no se sustituyen por estas imágenes.

La documentación de Google pide gráfico de 1024 × 500 sin alfa y recomienda cuatro capturas de teléfono en 9:16 de al menos 1080 px; también exige representar fielmente la app. Estas dimensiones y las alternativas textuales se contrastaron con los [requisitos oficiales de recursos](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en-GB), consultados el 25 de octubre de 2026. La consola puede requerir otros tamaños o recursos según los dispositivos y funciones elegidos.
