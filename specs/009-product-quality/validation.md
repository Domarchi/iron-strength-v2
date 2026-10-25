# Validación de calidad de producto

## T189

Alcance, inventario por plataforma y recorridos contrastados con las rutas, contratos y spec 008 sobre d18526a. Check raíz aprobado el 24 de octubre de 2026: formato, lint sin errores (diez avisos existentes), tipos, 519 unitarias y build Next 16.4.3 con 64 recursos. Evidencia privada product-t189-check.log. Sin cambios de código, base o producción; no se añadieron tests que dupliquen documentación. El plan distingue funciones disponibles, pendientes y requisitos de firma/aceptación física.

## T190

Prototipo autónomo en mobile/public/design-review/index.html, sin API, autenticación, recursos externos o persistencia. Cuatro vistas y dos temas; cambios de serie, búsqueda y revisión de asignación simuladas. Marca DEMO visible en capturas. El propietario aceptó después la base visual y solicitó ajustar el check; T194 registra por separado su traslado a la app real.

Prueba previa en rojo por ausencia de referencia. Primer recorrido detectó colisión de una variable global del navegador; se corrigió y añadió captura de errores de ejecución. Axe detectó que la barra de avance carecía de rol: ahora expone progressbar y valores. No se desactivaron reglas.

Check raíz aprobado (519 unitarias, formato, tipos, lint sin errores con diez avisos previos y build); check móvil con 27 pruebas y un aviso previo de hooks. Ocho E2E Chromium/WebKit aprobadas sin reintentos en 41 s: ocho combinaciones visuales por motor con Axe A/AA/2.1AA, sin desbordamiento, navegación/serie/diálogo y ausencia de peticiones de escritura o almacenamiento. Revisión adicional a 360 px, objetivos táctiles y retorno del foco al cerrar con Escape. Editor de escritorio compactado después de revisar capturas; ocho E2E finales repetidas sobre ese ajuste.

Capturas finales inspeccionadas y conservadas fuera de Git en work/product-design. Prototipo remoto abierto en navegador de Codex y disponible temporalmente mediante el túnel Expo existente: https://vjnvtvu-domarchi-8081.exp.direct/design-review/index.html. Esto publica solo la referencia con datos ficticios en el servidor de desarrollo, sin desplegar la app o modificar producción. Evidencia privada product-t190-before.log, product-t190-ui-final.log, product-t190-root-check.log y product-t190-mobile-check.log. Sin base/migraciones: no se ejecutaron integración ni pgTAP.

## T191

Preparación local implementada con app.config.js, eas.json y expo-dev-client 58.0.15 instalado mediante expo install. Perfiles development, preview, preview-simulator y production. Nombres, esquemas e identificadores distintos; IDs propuestos sin registro remoto. Default conserva el nombre/esquema actuales de Expo Go. Los scripts habituales conservan --go; el cliente de desarrollo tiene un comando explícito separado.

Las tres configuraciones públicas resueltas con Expo CLI conservan owner domarchis y el mismo EAS ID. Preview y production desactivan developmentClient y conservan la API HTTPS. No hay autoenvío, updates, build remoto o firma. La configuración no acredita un instalador. Guía y requisitos en docs/native-distribution.md; disponibilidad de cuentas/identificadores, firma, archivo de subida y cuotas se verifican antes de T201. Preview comparte servidor real y no se usa para pruebas destructivas.

Cuatro pruebas previas cubren identidad/variantes, rechazo de valor desconocido y conservación de incrementos locales de buildNumber/versionCode. La regresión de incrementos pasó de rojo a verde al respetar valores locales existentes. Check móvil final con **31 pruebas**, lint sin errores (un aviso previo) y tipos. Check raíz completo aprobado con **519 unitarias**, diez avisos previos sin errores y build. **28 E2E Expo web** aprobadas en ambos motores, sin reintentos, en 3,3 min: veinte del producto y ocho de las referencias. Expo doctor **20/20** y exportaciones Hermes Android/iOS aprobadas; bundles release conservan las mismas huellas que T188 porque no se cambió la interfaz funcional. Se distinguen estos controles de la aceptación física y firma.

Auditoría del árbol móvil registra cinco avisos altos previos y dos moderados en @expo/ngrok/uuid; no hay críticos. Se documentan como revisión pendiente antes de distribución, sin forzar el downgrade incompatible que propone npm audit. Esta preparación no declara aprobada la distribución a tiendas. Evidencia privada product-t191-audit.json.

No se ejecutaron operaciones de Supabase/Vercel, pruebas destructivas, migraciones, registro de aplicaciones, certificados, builds de pago ni contratación de servicios. T191 solo prepara; T201/T202 y aceptación física continúan pendientes. Evidencia privada product-t191-before.log, product-t191-version-before.log, product-t191-mobile-release.log, product-t191-root-check.log, product-t191-ui.log, product-t191-config-verification.json, product-t191-doctor.log y product-t191-bundle.log.

## Cierre de la referencia y conexión de desarrollo

Después de preparar variantes, el túnel se reinició explícitamente en Expo Go, sin CI ni APP_VARIANT heredada. Manifiestos SDK 58 con el nombre original y bundles iOS/Android responden 200; huellas iguales a T188 y sin referencia a secreto administrativo. El HTML del prototipo responde 200 en el mismo túnel. Evidencia privada product-t191-tunnel-verification.json; no se atribuye prueba física a la descarga.

La revisión del prototipo detectó que marcar una serie actualizaba el control pero dejaba estático el contador. Se añadió la aserción al recorrido existente (rojo), se sincronizó el resumen y la tarjeta de Inicio con el estado en memoria y se verificó en ambos motores (dos E2E aprobadas, 11 s). Sin escrituras, API o persistencia añadidas. Las capturas iniciales conservan el mismo aspecto. Check raíz repetido para el cierre; evidencia product-t190-count-before.log, product-t190-count-final.log y product-t190-count-check.log.

## T194 · Diseño funcional y check circular

Base T190 aceptada por el propietario; autorizó avanzar y añadió el requisito de un check pequeño y circular. T194 se adelanta a T192–T193 como entrega visual independiente de acceso/cuenta. El editor web permanece para T200. La aceptación física se mantiene separada.

Inicio muestra primero el registro activo; si no hay borrador, destaca una rutina pendiente con consulta previa. Avance semanal y filas de sesiones usan datos de la API existente. El registro reduce la cabecera, alinea kg/reps y separa WorkoutSets/SetCheck del recorrido principal; los mismos mutadores/controlador conservan series, calentamientos, superseries, foco, descanso, cierre y reintentos. Indicaciones y alternativas están en un detalle explícito. El círculo visible mide 26 px, el icono 16 y el área de pulsación 48 × 48, con rol checkbox y estado seleccionado. La referencia HTML usa la misma forma, foco de teclado y control semántico. Sin animaciones que demoren acciones frecuentes.

Historial, progreso, rutina y cuenta conservan funciones y temas; se revisaron tipografía, separadores y textos. Progreso continúa usando marcas reales de todo el historial: no ofrece los periodos ni el gráfico ficticio de T190. No se modificaron contratos, claves de almacenamiento, proveedores, rutas de API, base de datos o permisos.

Pruebas previas en rojo por ausencia de marca circular en referencia y app (product-t194-before.log). La primera pasada posterior aprobó 28 casos y falló en cuatro nuevos: un selector de etiqueta también encontraba una pantalla oculta conservada por la pila de navegación. Se cambió al control accesible de la pantalla activa y se repitió toda la suite, sin omitir reglas o recorridos. Evidencia product-t194-ui-first.log.

Validación final del 24 de octubre de 2026:

- Check raíz aprobado: formato, lint sin errores (diez avisos previos), tipos, **519 unitarias** y build Next 16.4.3, 64 recursos públicos. product-t194-root-check.log.
- Check móvil aprobado: tipos, lint sin errores (un aviso previo), **31 unitarias**. product-t194-mobile-final.log.
- **36 E2E Expo web** Chromium/WebKit aprobadas, sin fallos ni reintentos, en 2,8 min. Incluyen consulta sin inicio, tema persistente, recuperación, respuesta perdida sin duplicación, fallo de almacenamiento, calentamientos, alternativas, superseries, tabla/check, pantallas con datos confirmados, Axe A/AA/2.1AA, 360 px y movimiento reducido. La referencia verifica también el cambio por teclado. product-t194-ui-final.log.
- Doctor **20/20** y exportaciones Hermes Android/iOS aprobadas. Bundles entry-3567187d57f915e4bbd4d49b13f58905.hbc / entry-8ff237d92266b8565da34d43d263aa85.hbc. product-t194-doctor.log y product-t194-bundle.log. Exportación no equivale a instalador firmado.
- Revisión visual de Inicio claro, registro oscuro con check completado y Progreso oscuro. Capturas de ocho referencias y pantallas funcionales conservadas fuera de Git en work/product-t194-design; los registros de prueba son sintéticos e interceptados, sin escribir en producción.
- El túnel existente entrega manifiestos SDK 58 y bundles actualizados iOS/Android con respuesta 200, nombre/proyecto conservados y componentes nuevos presentes. Referencia HTML 200 con check circular; no hay referencia a clave administrativa. product-t194-tunnel-verification.json. Esto confirma entrega de desarrollo, no apertura física.

Sin cambios de SQL/API ni pruebas destructivas: no se ejecutaron pgTAP, integración, semillas o migraciones. No se desplegó Vercel ni se modificó Supabase. Las tareas de invitación/cuenta T192–T193, las nuevas funciones de seguimiento/offline, firma y publicación continúan pendientes en la hoja de ruta.

## T206 · Correcciones de series y descanso

El propietario reportó fallos al registrar series o descansar. Se reprodujeron antes de corregir: avisos de validación fuera de la fila, controles de descanso fuera del área visible al desplazarse, calentamiento que iniciaba 60 s pese a tener 0 s en su grupo, y valores de la referencia HTML que se reiniciaban al cambiar tema. Evidencia product-t206-unit-before.log (un fallo reproducido y una prueba de recuperación aprobada) y product-t206-ui-before.log (dos E2E en rojo).

WorkoutSets muestra la causa junto a la serie, elimina el aviso al editar y conserva los valores; entradas inválidas no completan ni cambian el descanso. Los errores de almacenamiento siguen visibles en el estado global. RestControls es un hermano del ScrollView dentro de KeyboardAvoidingView: usa espacio propio, áreas seguras y controles táctiles de 48 px. No tapa el registro ni depende de desplazarse al final. Ajustar/omitir conserva la lógica de término absoluto, sin reiniciar al cambiar ejercicio o recuperar. El calentamiento usa la prescripción del grupo igual que el cliente web, incluido 0 para desactivarlo, y no avanza la ronda.

La referencia conserva kg/reps en memoria al navegar o cambiar tema y escapa los valores al reconstruir HTML. Explica que el tiempo mostrado es fijo; el temporizador funcional se prueba en Expo. No añade persistencia, acceso ni escrituras de cuenta. El alcance de T190 se conserva.

Validación del 24 de octubre de 2026:

- Check raíz aprobado: formato, lint sin errores (diez avisos existentes), tipos, **519 unitarias** y build Next con 64 recursos. product-t206-root-check.log.
- Check móvil aprobado: tipos, lint sin errores (un aviso previo), **33 unitarias**. Incluye el fallo de calentamiento corregido y recuperación del término absoluto/expiración, además de conservación del timer ante un valor inválido. product-t206-mobile-check.log.
- **Seis E2E enfocadas** y luego **42 E2E completas**, Chromium/WebKit, sin fallos/reintentos; pasada completa de 3,4 min. Casos nuevos: 501 kg/101 reps y corrección, coma decimal, timer visible al enfocar la primera serie, ajustes ±15 s, cambio de ejercicio, recuperación con mismo término/valores, omisión persistida y referencia sin pérdida de entradas al navegar. Conserva pruebas de superseries, respuesta perdida/idempotencia, almacenamiento lleno, claro/oscuro, 360 px, movimiento reducido y Axe A/AA/2.1AA. product-t206-ui-focused.log y product-t206-ui-final.log.
- Doctor **20/20** y Hermes Android/iOS aprobados: entry-979fbb87fcd5accfb5bf59c6900ef453.hbc / entry-10041a17ecc6a45aa31f00e07aa11fba.hbc. product-t206-doctor.log y product-t206-bundle.log.
- Capturas de recuperación claro/oscuro inspeccionadas: barra de descanso visible, con espacio separado del registro. Evidencia fuera de Git en work/product-t206-design. Datos sintéticos, peticiones interceptadas; no se probaron cuentas reales mediante automatización.
- Túnel SDK 58 entrega manifiestos/bundles nuevos iOS/Android con HTTP 200, mismos nombre/proyecto y componentes corregidos presentes. HTML 200 con retención en memoria y aclaración de tiempo fijo. product-t206-tunnel-verification.json. Sin referencia a clave administrativa; sin firma o build remoto.

Sin cambios de web/API/SQL, semillas, migraciones, integración o pgTAP. La recuperación comprobada no sustituye la aceptación física en iPhone/Android, especialmente teclado y bloqueo de pantalla. No se publicaron cambios en Vercel/Supabase ni en tiendas.
