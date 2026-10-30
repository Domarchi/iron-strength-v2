# Google Play · candidatos de ficha

Cuatro composiciones Android y un gráfico de presentación, todavía sin subir. Las capturas se actualizaron el 30 de octubre desde el APK quality9, compilado desde a1c5d27 con Expo 58.0.21 / React Native 0.88.1. Incluyen la corrección T222 y usan una cuenta ficticia ya existente en la base aislada. Muestran la interfaz nativa funcional, sin datos de alumnos reales. Siguen siendo candidatos de preparación; no acreditan aprobación de la tienda ni aceptación en teléfonos.

| Archivo             | Contenido                             | Tamaño      |
| ------------------- | ------------------------------------- | ----------- |
| 01-home-dark.png    | Inicio y siguiente rutina, oscuro     | 1440 × 2560 |
| 02-workout.png      | Serie registrada y descanso activo    | 1440 × 2560 |
| 03-progress.png     | Volumen de doce semanas               | 1440 × 2560 |
| 04-home-light.png   | Inicio y siguiente rutina, claro      | 1440 × 2560 |
| feature-graphic.png | Ilustración vectorial de presentación | 1024 × 500  |

Todas las exportaciones son PNG RGB, sin canal alfa. Cada composición conserva los 1080 × 2400 píxeles de la captura completa, sin escala, recorte o cambios, y añade encabezado y márgenes fuera de ella. El gráfico de presentación es una ilustración, no una pantalla de la app. El texto «Datos de demostración» identifica la cuenta ficticia. El gráfico conserva los datos existentes, incluido su único punto; no se inventaron resultados para llenarlo. El borrador usado para capturar una serie y su descanso se descartó después desde la propia app, sin enviar el entrenamiento.

## Reproducción y comprobación

Desde la raíz: `node docs/store-release/generate-google-play.mjs`. Usa Sharp y Prettier existentes y Noto Sans instalada en el sistema, sin descargar fuentes o añadir dependencias. Los originales están en source; el SVG de presentación también es editable. `source/capture.json` vincula las cuatro imágenes al APK, bundle Hermes, mapa compuesto, certificado y commit inspeccionados. Solo admite campos técnicos explícitos: no añadir credenciales, identificadores de cuentas o rutas privadas. El generador rechaza campos ajenos y verifica las cuatro huellas antes de sustituir composiciones.

También comprueba dimensiones, canales y textos alternativos de hasta 140 caracteres. Extrae el rectángulo de interfaz y compara todos sus píxeles RGB con el original; un cambio falla la generación. manifest.json registra la procedencia, dimensiones y SHA-256 tanto de fuentes como de exportaciones. El APK quality9 tiene identidad exclusiva de QA y no reemplaza el instalador preview6 ni es un candidato de producción.

Se revisaron visualmente las cinco exportaciones: títulos legibles, interfaz completa y distinción entre Android, demostración e ilustración. Las barras del sistema conservan la hora y el indicador de QA de las capturas originales. Antes del envío, recapturar desde el candidato de producción con notificaciones despejadas y datos de revisión adecuados; contrastar el contenido con ese binario y la consola. No ocultar indicadores reconstruyendo la interfaz. Las capturas iPhone siguen pendientes y no se sustituyen por estas imágenes.

La documentación de Google pide gráfico de 1024 × 500 sin alfa y recomienda cuatro capturas de teléfono en 9:16 de al menos 1080 px; también exige representar fielmente la app. Estas dimensiones y las alternativas textuales se contrastaron con los [requisitos oficiales de recursos](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en-GB), consultados el 25 de octubre de 2026. La consola puede requerir otros tamaños o recursos según los dispositivos y funciones elegidos.
