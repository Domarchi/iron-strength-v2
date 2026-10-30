# App Store · candidatos iOS de ficha

Cuatro capturas nativas de iPhone Air, iOS27.0, obtenidas el30-oct-2026 desde quality-simulator8 con Expo58.0.21/React Native0.88.1. Incluyen T222 y usan la cuenta ficticia existente de la demo aislada. Son borradores QA: antes de enviar a la tienda se deben recapturar y revisar con el binario de producción. No son imágenes Android, prototipos o interfaces reconstruidas.

| Archivo           | Contenido                                           | Tamaño      |
| ----------------- | --------------------------------------------------- | ----------- |
| 01-home-dark.png  | Inicio, siguiente rutina y avance semanal en oscuro | 1260 × 2736 |
| 02-workout.png    | Serie40kg×10, check circular y descanso1:21         | 1260 × 2736 |
| 03-progress.png   | Volumen existente675kg de Curl femoral en12semanas  | 1260 × 2736 |
| 04-home-light.png | Mismo Inicio en claro                               | 1260 × 2736 |

Se revisaron los cuatro originales: acceso funcional, temas distintos, registro sin teclado superpuesto y gráfico con el único punto existente, sin inventar historial. El borrador de captura se descartó mediante la confirmación de la app; SQLite quedó sin registro activo ni cola y ambos endpoints del resultado devolvieron404. El simulador propio fue retirado y los dos secretos temporales de captura eliminados con ausencia confirmada. No se modificaron rutinas, usuarios o resultados remotos.

## Procedencia y reproducción

Desde la raíz: `node docs/store-release/generate-app-store.mjs`. Usa Sharp/Prettier ya instalados para validar y registrar, sin transformar las imágenes. Los PNG exportados son idénticos byte por byte a los originales de source: no hay marcos, recorte, escala, retoque o cambios de perfil de color. Son RGB opacos, sin canal alfa; mantienen hora, barras del sistema y metadatos del simulador.

source/capture.json contiene exclusivamente procedencia técnica: artefacto/build/commit, hashes de archivo/Hermes/mapa, workflow/arnés, dispositivo y huellas de imágenes. No incluir identificadores de cuentas, credenciales o rutas privadas. El generador valida todas las fuentes antes de reemplazar salidas y rechaza campos ajenos, huellas incorrectas, imágenes repetidas, canales o geometrías incompatibles. manifest.json conserva hashes de fuentes y exportaciones, dimensiones y descripciones alternativas. Controles negativos en copias privadas confirmaron que un campo extra o una imagen alterada conservan las cinco salidas anteriores; repetir la generación produce exactamente los mismos archivos.

El workflow aprobado es01a18cad-967d-7739-99b5-2e893bc64065, arnésfe6db7b, con el mismo artefacto70774fb1-e41e-4e7c-9b87-97369911900a/c3505b0. Los tres intentos previos fallidos se conservaron; no acreditan este resultado. El recibo automático uiContentVerified=false permanece intacto y la revisión de originales se registra aparte.

Apple acepta1260×2736 para iPhone con Dynamic Island grande y exige imágenes sin alfa. [Especificaciones oficiales de capturas](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/), consultadas el30-oct-2026. Esta categoría no sustituye la comprobación final de dispositivos y tamaños requeridos en la consola. No acredita iPhone físico, accesibilidad AA, beta, IPA firmada o aprobación de tienda.
