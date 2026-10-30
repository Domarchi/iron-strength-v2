# Propuesta visual — T225

Referencia de producto: specs/011-visual-flow. Prototipo HTML/CSS/JS independiente de Expo, Next y Supabase. No implementa el nuevo diseño en el cliente nativo ni sustituye la demo que está probando el propietario.

## Revisar

Abrir `prototype/index.html` mediante un servidor HTTP estático. Acepta `view=home|routine|workout`, `theme=dark|light` y `state=ready|active|pending|error`. El selector superior cambia el estado y el botón de sol/luna cambia el tema. La etiqueta «Propuesta · no guarda» permanece visible.

`comparison.html` presenta Inicio, Rutina y Entrenamiento en los dos temas, con imágenes actuales y propuestas. Las capturas son WebKit a 390 × 844 px. En el registro ambas referencias muestran una primera ronda completada; se conservaron prescripciones diferentes por serie, alternativa autorizada y descanso de 60 s del fixture existente. No se inventó una ejecución anterior: la referencia aparece vacía cuando no existe.

El prototipo permite consultar, comenzar, completar checks, avanzar entre integrantes, ajustar/pausar el descanso, volver/retomar, cambiar tema, abrir contexto y simular cierre/reintento. Todo vive solo en memoria: recargar lo reinicia. Las herramientas que todavía no tienen una pantalla prototipada abren un aviso honesto; no se presentan como funciones nativas implementadas. CSP bloquea conexiones; no hay API, autenticación, localStorage, cookies, analítica, service worker o envío real.

El enlace remoto temporal y sus verificaciones se guardan fuera de Git. Para servirlo, copiar únicamente HTML/CSS/JS y las doce imágenes necesarias a un directorio nuevo del servidor de vistas previas. No sustituir la raíz, los bundles, la demo o los datos existentes. Una futura implementación debe preservar los contratos de la app, no reutilizar este estado volátil como almacenamiento real.

## Decisiones de diseño para aprobar

- Inicio: una acción primaria y disponibilidad local como fila, con menos paneles.
- Registro: cabecera corta, dos integrantes visibles en el índice, columnas compartidas y objetivos por serie legibles. Check circular de 26 px dentro de 48 px táctiles.
- Rutina: resumen compacto, agrupación explícita y objetivos distintos por serie conservados.
- Negro/grafito y claro neutro, azul para acción/selección, tipografía del sistema y cifras tabulares. Sin imágenes decorativas.
- Panel contextual y señales de pulsación discretas; movimiento reducido. No extrapolar fluidez nativa de esta simulación web.

La aprobación visual del propietario sigue pendiente antes de T226–T232. Registrar qué versión aprobó y los ajustes solicitados; una prueba automatizada no sustituye esa decisión.

## Verificación reproducible

Desde la raíz del repositorio, con las dependencias de desarrollo y navegadores Playwright instalados:

```sh
npx playwright test -c docs/design-refresh/playwright.config.ts
```

El servidor exclusivo del test usa 8094 y solo archivos estáticos; no carga variables de Supabase ni prepara bases. Los casos cubren 360/390/420 px, ambos temas, contraste AA automatizado, controles táctiles, ronda y descanso simulados, navegación y tema sin perder valores, pendientes/errores, texto al 200 %, Escape y retorno de foco, ausencia de persistencia y las imágenes/enlaces de comparación. Esto no acredita el teclado del iPhone, SQLite nativo o aceptación física.

Las seis capturas propuestas están en `proposal/`; su manifiesto distingue la referencia anterior del resultado pendiente de aprobación. El historial de fallos del colector y las pasadas de pruebas queda en la evidencia privada y en specs/011-visual-flow/validation.md.
