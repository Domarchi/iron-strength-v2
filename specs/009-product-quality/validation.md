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

## T192 · Invitación y recuperación móvil

Se reutilizan las invitaciones y el registro existentes, con tres rutas POST cerradas de API v1 y una pantalla nativa de acceso. La consulta no consume la invitación; abrir recuperación tampoco verifica el OTP. Solo enviar una contraseña válida consume recuperación. El servidor devuelve confirmación, nunca la sesión temporal de recuperación. El acceso posterior sigue siendo explícito. Web conserva sus formularios y ofrece abrir la app instalada o copiar su enlace en Acceso móvil; Expo Go utiliza este último recorrido.

Los enlaces aceptados tienen origen/ruta o esquema conocidos y parámetros cerrados. Token y contraseña permanecen en memoria del formulario y la ruta se reemplaza al terminar o cancelar. La cuenta autenticada no se sustituye al abrir otro acceso; se mantienen las protecciones de pendientes de Cuenta. Una respuesta incierta explica cómo entrar con la contraseña elegida, sin asegurar que la operación se revirtió.

Pruebas previas en rojo por falta de módulos/métodos: product-t192-api-before.log, product-t192-client-before.log y product-t192-client-method-before.log. Se comprobó el hash de recuperación real de Auth (SHA-224, 56 hexadecimales) con la fuente oficial y la integración aislada, antes de fijar el contrato. No se alteró su duración remota. La comparación estructural mínima del decodificador evita acoplar los tipos internos de las dos versiones compatibles de Zod en raíz/móvil.

Verificación de software del 24 de octubre de 2026:

- Check raíz completo aprobado: formato, lint sin errores (diez avisos previos), tipos, **526 unitarias** y build Next 16.4.3 con 64 recursos públicos. product-t192-root-check.log.
- Check móvil aprobado: tipos, lint sin errores (un aviso previo) y **37 unitarias**. Parser, formato cerrado, credenciales de acceso sin persistencia y protección de identidad incluidos. product-t192-mobile-final.log.
- **280 pruebas de integración** aprobadas sobre la instancia aislada 55321. Consulta repetida, alta ligada al coach, invitación usada/vencida/desconocida, contraseña inválida que no consume, cambio válido de un solo uso y login posterior. product-t192-integration.log.
- Exportaciones Hermes Android/iOS aprobadas: entry-375757f25d9276f274eca0574b159320.hbc y entry-a1a8c43ef5c6ae243540c9753b8627f9.hbc. product-t192-bundle.log. No son binarios firmados.
- **52 E2E Expo web** Chromium/WebKit aprobadas, sin fallos/reintentos: acceso en claro/oscuro, Axe a 360 px, enlace externo/reutilizado, recuperación de la misma cuenta con series conservadas y regresión completa de registro/descanso/almacenamiento. La primera pasada quedó interrumpida sin resultado final; se repitió completa y terminó en verde. product-t192-native-ui-rerun.log. Capturas claro/oscuro inspeccionadas y conservadas en work/product-t192-design.
- **12 E2E web/API** aprobadas en Chromium/WebKit, sin fallos/reintentos: circuito principal de invitar/asignar/entrenar/comentar, nuevas rutas de acceso y regresión de API móvil. Axe aprobado en invitación/recuperación web. product-t192-web-ui.log.

Las nuevas rutas aún no están publicadas en Vercel. Sin migraciones, pgTAP o cambios de producción; solo Auth y datos de la pila aislada se modificaron en las pruebas. Apertura por esquema/teclado en teléfonos físicos pendiente para T201–T202. El propietario confirmó que todavía no tiene cuentas de Apple Developer ni Google Play Console: son un requisito de distribución, no un impedimento para estas tareas de desarrollo.

## T193 · Cuenta y eliminación nativa

Cuenta añade privacidad/ayuda local, también accesible sin sesión, y eliminación del alumno desde la app. Exportación conserva su recorrido web, sin afirmar que existe exportación nativa. El resumen explica almacenamiento, visibilidad, salida/desinstalación/borrado y ayuda mediante el coach. No se publica un correo personal ni se sustituye la política final de T203. La cuenta propietaria sigue protegida por DC-4; cualquier decisión de cierre de esa cuenta y su información para tiendas se revisará en T203.

POST account/delete acepta solo Bearer y confirmación escrita, deriva la identidad autenticada y rechaza al coach antes de tocar fotos. Usa deleteOwnAccount y su RPC existente, sin cliente administrativo adicional ni SQL. Un borrado parcial de archivos no afirma que todos se conservaron. La confirmación advierte sobre pendientes y permite exportar antes.

El recibo local v1 (ID y fase requested/confirmed) se escribe y relee antes del servidor. Durante el proceso se bloquean otras acciones. Tras confirmación remota se limpia únicamente el almacén de entrenamiento de esa identidad y su sesión conocida, conservando apariencia/otras cuentas. Fallo local conserva el recibo, recuperable al reabrir, y no reenvía el borrado remoto. Una sesión bloqueada exige recuperarla o confirmar salida antes de finalizar la limpieza. Una respuesta incierta permite conservar datos o escribir BORRAR LOCAL, distinguiendo descarte local de eliminación remota. El formulario de descarte se desmonta entre operaciones para no reutilizar confirmaciones. Formatos desconocidos se conservan.

Pruebas previas en rojo por ausencia de los módulos de API/recibo (product-t193-api-before.log y product-t193-removal-before.log). Verificación de software del 24 de octubre:

- Check raíz con **529 unitarias**, tipos, formato, lint sin errores (diez avisos previos) y build Next 16.4.3; product-t193-root-check.log. Se repite sobre el ajuste final de recuperación.
- Check móvil con **44 unitarias**, tipos y lint sin errores (un aviso previo); product-t193-mobile-close.log. Incluye aislamiento de limpieza, cuota/escritura/relectura, respuesta incierta, recibo desconocido, confirmación cuya escritura falla y respuesta de identidad diferente.
- **282 integración** aprobadas, 42 archivos, exclusivamente 55321. El coach conserva sus fotos; alumno solo borra su usuario, destino adicional se rechaza y otra cuenta permanece intacta. Regresión completa de contratos existentes. product-t193-integration.log.
- **64 E2E Expo web** aprobadas en Chromium/WebKit, sin fallos/reintentos, 5,6 min. Cuenta, confirmación, privacidad clara/oscura a 360 px con Axe, limpieza recuperada tras recarga, respuesta incierta con registro real de demo conservado y toda la regresión anterior. product-t193-native-final.log. Se repiten acceso/cuenta sobre el último ajuste que vacía la confirmación entre intentos.
- **14 E2E web/API** aprobadas en ambos motores sin fallos/reintentos, 2,5 min. Añade frontera real de borrado (Bearer/rol/destino/confirmación/no cookies/refresh revocado) al circuito de acceso, API y coach/alumno anterior. product-t193-web-final.log.

Revisión React de componentes: efectos solo para recuperación, estado externo con snapshots estables, formularios separados sin componentes anidados, suscripciones desmontables y confirmación fuera de render. Capturas de privacidad inspeccionadas y conservadas en work/product-t193-design. La exportación Hermes y la emulación no acreditan binarios firmados o aceptación física. Sin dependencias nuevas, migraciones o pgTAP; no se ejecutaron pruebas destructivas sobre la base interactiva ni remota. Publicación de estas rutas se registra por separado al promover un artefacto verificado.

Cierre de software: **20 E2E finales** de acceso/cuenta aprobadas en ambos motores, sin fallos/reintentos (1,6 min), sobre el ajuste que desmonta la confirmación entre operaciones. Check raíz final repetido con **529 unitarias** y build aprobado (product-t193-root-close.log). Móvil **44 pruebas** y exportación final Android/iOS: entry-cd0328cf870875a2f6f4d1abd61d64ef.hbc / entry-db78a9d1c52d1ab2297a3a02220746f2.hbc. product-t193-native-close.log, product-t193-mobile-close.log y product-t193-bundle-close.log.

Preparación de publicación: proyecto/equipo Vercel y repo v2/main-54qpxa confirmados, Node 24 y autoasignación de dominios false. Supabase exclusivo ACTIVE_HEALTHY, 39 migraciones coincidentes, cero tablas públicas sin RLS y bucket privado sin objetos. Se generó un respaldo privado nuevo de seis volcados: hashes verificados, 49 tablas/523 filas estables durante la copia; no se presenta esta instantánea nueva como restaurada. El ensayo anterior del mismo esquema (23 de octubre) y sus seis hashes siguen verificados. Sin escrituras en datos remotos ni cambio de esquema; estos controles no prueban un borrado real de producción. Evidencia privada product-t193-remote-verification.json y product-t193-backup-verification.json.

## Publicación de acceso y cuenta · T192–T193

Publicado el 24 de octubre de 2026 en https://iron-strength-seven.vercel.app: **H dpl_2uzVPtnPS6u4joJDok6KG4dpiAD8**, source **ea47e6305d85c3dc57c1e6968959f3e8483f9210**, BUILD_ID **1d3e1ab731c441548260d5f9b0e19695**, Next 16.4.3 / Node 24. Se comprobó primero el despliegue de producción preparado sin mover el dominio público. **19 controles Staged** mediante vercel curl autenticado, sin desactivar protección; promoción del mismo artefacto y **19 controles públicos** con el mismo BUILD_ID. La autoasignación se restituyó a false y se confirmó por GET del proyecto, junto con el destino H y repo v2.

Los controles incluyen recursos públicos/worker de 64 recursos compatible con borradores v1/v2/v3 sin skipWaiting, pantallas privadas, API JWT sin cookies/no-store, entrada inválida rechazada antes de registro/recuperación/borrado y consulta real de invitación inexistente sin consumo o escritura. No se registraron alumnos ficticios, borraron usuarios reales, cambiaron contraseñas, enviaron correos o aplicaron migraciones. La primera comprobación pública normalizó también el valor de Vary para compararlo sin distinguir mayúsculas; la respuesta de la app ya era correcta. Evidencia product-t193-staged-verification.json y product-t193-public-verification.json.

El análisis acotado de errores de runtime del nuevo despliegue no devolvió entradas en los diez minutos consultados. No equivale a monitorización continua ni aceptación de usuarios. CI **40149833366** permanece en startup_failure; no se declara verde. Se utilizaron los controles locales y la autorización de publicación ya existente; resolver CI sigue en T202.

Expo Go SDK 58 conserva el mismo túnel/proyecto: manifiestos y bundles de iOS/Android responden 200 e incluyen acceso/privacidad/eliminación actualizados, sin referencias a cliente administrativo o secreto de servidor. product-t193-tunnel-verification.json. Esto confirma entrega de desarrollo, no apertura física o instaladores firmados. Cuenta → Privacidad y ayuda muestra el resumen operativo; Login → Tengo un enlace de mi coach permite pegar el enlace HTTPS actual.

Recuperación anterior **G dpl_8a9viKYYVE91H4yQiwe4TBpXtn4b** conserva web y registro nativo, pero carece de las rutas de acceso/cuenta nuevas. Volver a G exigiría corregir esas rutas hacia adelante; los recibos y registros inciertos se conservan. No revertir datos/esquema. Firma, cuentas de tiendas, enlaces físicos, política pública/soporte final y aceptación del coach/tres alumnos siguen pendientes separados.
