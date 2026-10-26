# Hevy: análisis estructural con REA

Fecha: 2026-10-19. Objetivo: orientar la reconstrucción propia del registro de entrenamiento de Iron Strength. Se analizó la distribución web pública de [Hevy](https://www.hevy.com), no el binario Android/iOS ni su servidor.

## Herramienta y adquisición

- Distribución oficial: [morluto/rea](https://github.com/morluto/rea), paquete npm `rea-agents@6.7.0`. Se ejecutó el CLI local con Node 24.22, sin registrar un MCP, modificar la configuración de Codex ni instalar motores nativos. Se siguió su guía `skills/reverse-engineer-anything/SKILL.md`, incluida en el paquete descargado.
- Se descargaron por HTTPS el HTML público y 35 archivos enumerados por sus scripts y su manifiesto Next.js: 34 archivos JavaScript/JSON y una hoja CSS. No se inició sesión, ejecutó código del cliente ni llamó a endpoints de datos de usuarios.
- Build público observado: `gNz46ZMOKbURD2LOJPBDY`. Manifiesto: [archivo público de rutas](https://www.hevy.com/_next/static/gNz46ZMOKbURD2LOJPBDY/_buildManifest.js).
- El inventario adquirido, sus URLs y SHA-256 están en `work/hevy-client/acquisition.json`, en la carpeta padre del repositorio. Las dependencias de REA, los bundles y la evidencia completa permanecen fuera del producto y del control de versiones.

Comando de la primera pasada, desde la carpeta padre del repositorio:

```sh
node work/rea-tooling/package/scripts/rea.mjs analyze-javascript-application "$PWD/work/hevy-client" \
  --source-path routines-8c9f1da35cbc7794.js \
  --source-path '[[...destinationFolderId]]-7c04a6cfae101a05.js' \
  --source-path '[routineId]-442ce017b4abc36b.js' \
  --source-path '[workoutId]-a72c4adfc1daf170.js' \
  --analysis-timeout-ms 60000 --json > work/hevy-rea-evidence.json
```

La segunda pasada usa el mismo comando con tres `--source-path`: `5575-106f021669763173.js`, `4408-58912104d8bd76aa.js` y `0-b95f4da54fa8cf51.js`, guardando `work/hevy-rea-editor-evidence.json`. No se ejecutaron los bundles al formatearlos o analizarlos.

## Evidencia obtenida

| Registro REA                                                          | Selección                                             | Resultado                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `ev_24317da7420b7e21f7a1bf849b8cd355d1a685282be418de39fc91be8f045564` | Rutinas, creación, edición y detalle de entrenamiento | 4 archivos procesados, 16 nodos de módulo, 54.691 bytes leídos, 0 errores de parseo  |
| `ev_f6149b33ab47234608cd5bad41b6cd663fd37cd4388d320cc2dc567c67b6ccf3` | Módulos compartidos del editor y detalle              | 3 archivos procesados, 22 nodos de módulo, 212.147 bytes leídos, 0 errores de parseo |

Identidad del inventario en ambas pasadas: `53fe007e5a9dca18b3a93f2714e743ab9f60810346afaf620ae8754714118f25`. Los nodos incluyen módulos fuente y factories Webpack; no representan clases originales recuperadas. La cobertura de ambos grafos es parcial.

## Hallazgos y decisiones

Las observaciones siguientes combinan el inventario AST de REA con lectura focalizada del mismo archivo formateado. Los offsets son posiciones de caracteres, base cero, en el archivo minificado original. Los nombres de factories numéricos solo identifican esta versión.

| Pregunta                                | Evidencia observada                                                                                                                                                                                                             | Interpretación y aplicación                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Qué estructura tiene una rutina?       | En el bundle `5575`, factory `55575`, el serializador recorre ejercicios y sus series, y produce campos de tipo de ejercicio, notas, descanso, repeticiones/rango, carga y agrupación. La ruta de creación importa esa factory. | El cliente mantiene una estructura editable por ejercicio y serie. Se conserva nuestro borrador propio y los contratos del coach.                                     |
| ¿El descanso es por ejercicio?          | El mismo módulo tiene un manejador `onRestTimerUpdate` que escribe en el ejercicio indicado (offset 19077); el serializador asigna la elección a `rest_seconds` (offset 10827).                                                 | Evidencia estática de estado y serialización por ejercicio, no de ejecución del temporizador móvil. Se implementa un selector propio persistido en el borrador local. |
| ¿Qué métricas muestra un entrenamiento? | El módulo de detalle lee `estimated_volume_kg` (offset 9314) y construye métricas de duración y, según datos, volumen, repeticiones o distancia. También proyecta series y descanso por ejercicio.                              | Se incorpora volumen en vivo al logger. Su fórmula usa `setVolume` de Iron Strength; no se afirma haber recuperado la fórmula del servidor de Hevy.                   |
| ¿Qué resume una rutina?                 | El componente de resumen en `5575` recibe número de ejercicios, series y duración estimada, además de datos por grupo muscular.                                                                                                 | Patrón confirmado en el cliente. No se añade una estimación de tiempo ni mapa muscular sin datos y reglas propios.                                                    |

Archivos clave para reproducir la inspección:

- [Editor compartido](https://www.hevy.com/_next/static/chunks/5575-106f021669763173.js), SHA-256 `449fd63e54357001e3e1f3197c3862fcee6f75842f2036e273e03f44d8f74160`.
- [Detalle de entrenamiento](https://www.hevy.com/_next/static/chunks/pages/workout/%5BworkoutId%5D-a72c4adfc1daf170.js), SHA-256 `a60a6d062b9896af7f28daad00f9d83d105d67aad54026e5d0f73d5db8da0d8a`.

## Límites y trabajo aplicado

Respondido parcialmente: estructura del cliente web de rutinas y detalle. Se analizaron siete archivos de un inventario de 35; las dependencias no seleccionadas, expresiones dinámicas y llamadas indirectas siguen sin resolver. No se ha observado la ejecución de Hevy, recuperado su backend ni analizado el paquete móvil. No se conocen por esta vía sus fórmulas internas de servidor, reglas completas de sincronización, almacenamiento ni manejo nativo de ventanas. La app local Hevy no apareció en la búsqueda acotada de binarios/paquetes del equipo.

T135 implementa descanso por ejercicio y volumen en vivo con código propio. Además corrige un fallo local descubierto durante la revisión: editar una serie hecha a un valor inválido ahora la desmarca, de modo que el guardado coincide con la confirmación. Esta corrección es una decisión de Iron Strength, no un comportamiento atribuido a Hevy.

La implementación no contiene código, imágenes, dependencias, endpoints ni credenciales de Hevy. Las comprobaciones y las limitaciones del entorno se registran en `specs/004-review-redesign/validation.md`.

## Revisión de temas y densidad · 26 de octubre de 2026 · T208

Se reutilizó el CLI oficial 6.7.0 ya instalado y su habilidad incluida, sin actualizar paquetes o registrar MCP. Primero se analizó el archivo principal archivado del 19 de octubre: Evidence `ev_37dd57d5cd30413123ca87cc105e74ac9049573658a90f1b2963ad2f628e3fd4`. Esa observación histórica no se atribuye al cliente actual.

La navegación HTTP pública ahora redirige a `hevy.com/login`. Se adquirieron únicamente los recursos de ese origen enlazados por el HTML: CSS, archivo principal y manifiesto. No hubo sesión, ejecución de bundles, solicitud a datos de usuarios ni adquisición de binarios móviles. Build observado `0PJhmMBt21ztKxybUcIVp`; [archivo principal público](https://hevy.com/_next/static/chunks/pages/_app-6a7c7443650d8a95.js), SHA-256 `bcb7a289d3c884ba6ad531a0381e09264db91e6ccf683236ad6a6cbdccef2e44`.

```sh
node work/rea-tooling/package/scripts/rea.mjs analyze-javascript-application \
  "$PWD/work/hevy-rea-20261026/current" \
  --source-path _app-6a7c7443650d8a95.js \
  --max-semantic-nodes 12000 --max-semantic-nodes-per-file 12000 \
  --max-semantic-unknowns 3000 --max-semantic-unknowns-per-file 3000 \
  --analysis-timeout-ms 60000 --json > work/hevy-rea-20261026/current-evidence.json
```

Resultado REA: Evidence `ev_481fe641abf80dec0fa38a66ee984334f8e14fa0c1835b787a69acda7c975cb8`, 7.432.077 bytes, 285.281 nodos AST visitados, 275 módulos y cero fallos de parseo. La vista resumen es `ev_83e2ce31480d60efb28d0cb434000f04974332aa7dd8e7e007c5fa433101a711`; la vista del módulo de colores, `ev_7523449443c1c17bd07a832b176d77ac34095d152151e218d8d21dfcc5bf4de1`. La evidencia completa y las entradas/salidas de esas vistas quedan en `work/hevy-rea-20261026`, fuera de Git.

La lectura de los rangos inertes identificados por REA confirma:

| Factory de esta versión | Rango REA, línea/columnas base cero para columnas | Observación estática                                                                                                     |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `84548`                 | 38:4523135–4524102                                | Paleta: negro `#000000`, grafito `#161618`, borde oscuro `#2C2C2E`, azul `#008CFF`, variante `#1266BB`, verde `#56BD23`. |
| `3289`                  | 38:4524467–4525678                                | Dos temas con fondo negro/claro y superficies, borde y acento separados.                                                 |
| `12805`                 | 38:4518515–4522861                                | Escala tipográfica: cuerpo 15/21, secundario 13/18 y 11/16; encabezados 32/40, 24/32, 20/28 y 18/24.                     |

Esto orienta nuestra implementación, sin incorporar funciones, marcas, imágenes, dependencias ni llamadas de Hevy. El contraste accesible y el check circular aprobado se mantienen como decisiones de Iron Strength. Las [capturas oficiales del registro](https://www.hevyapp.com/features/track-workouts/) permiten contrastar tabla, estado completado y descanso; esas observaciones visuales no proceden del AST.

**Límites:** solo se analizó un archivo de los tres adquiridos; el inventario no representa toda la aplicación. La cobertura del grafo es parcial y el grafo semántico alcanzó los límites explícitos de 12.000 nodos/3.000 desconocidos. No se inferirá ausencia de lógica a partir de esos cortes. El análisis no establece comportamiento en ejecución, medidas exactas del cliente iOS ni código fuente original. Queda pendiente contrastar el resultado propio en el teléfono del propietario.
