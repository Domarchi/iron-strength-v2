# Validación — Primera entrega nativa

## T182–T183 · Especificación y API

Aprobación explícita de Expo y alcance de consulta registrada en spec.md. Pruebas del contrato escritas primero, fallo por módulo ausente conservado en evidencia privada; implementación después. Los siete casos unitarios cubren lista cerrada de rutas, privacidad, identidad, límites y errores. Integración real solo en 55321: cinco casos nuevos de permisos propios/ajenos, coach entrenando, intentos de login, perfil desactivado, renovación y salida sin revocar otra sesión web.

`npm run check`: aprobado, 513 unitarias, tipos, formato, lint sin errores (diez avisos existentes) y build Next 16.4.3 con 64 recursos públicos. Integración completa: 275 aprobadas. Cuatro E2E HTTP en Chromium/WebKit aprobadas sin reintentos: el proxy permite únicamente la frontera explícita, las cookies web no autentican al móvil, JSON privado/no-store sin Set-Cookie, cuerpos limitados, consulta propia y 404 ajena, ninguna escritura de entrenamiento y refresh revocado al salir.

No hay migraciones nuevas ni cambios de datos de producción. Las pruebas destructivas usaron exclusivamente la base aislada; no la app interactiva ni Supabase remoto. CI y aceptación física se mantienen como evidencias separadas.

## T184 · Cliente y pantallas

Cliente Expo SDK 57.0.31, React Native 0.86.3 y Router compatible; SecureStore para refresh token. Se reutilizan únicamente contratos y reglas puras desde src, nunca componentes de Next, DOM o código administrativo. React de la app móvil y de la web se instala por separado. Azul atleta claro/oscuro según sistema, recursos existentes, botones de al menos 44 px y estado vacío específico para coach/alumno.

`mobile/npm run check`: lint/tipos y once pruebas aprobadas. Incluyen red/401, formato futuro conservado, fallo de almacenamiento, respuestas tardías, renovación concurrente y reutilización de un token ya renovado. La prueba de navegador encontró Illegal invocation al invocar fetch como método: regresión añadida en rojo, corregida invocando el transporte como función, once pruebas verdes después. Expo web en Chromium/WebKit: cuatro casos aprobados, acceso/semana/rutina/alternativas/salida, recuperación de error, 360 px/oscuro y sin tokens persistidos en localStorage. Son datos sintéticos interceptados, distintos de la integración real de la sección anterior y de teléfonos físicos.

Exportación final de ambas plataformas aprobada: Android Hermes 3.454.447 bytes e iOS 3.109.522 bytes, con 35 recursos. No son binarios firmados. expo-doctor: 21/21 comprobaciones, después de corregir una copia transitiva de expo-font 58 por la versión 57.0.4 del SDK. Check de la raíz aprobado con 513 unitarias y build. La raíz excluye mobile de su TypeScript/lint y los recursos generados del formato; sus controles propios no se omiten.

Auditoría móvil sin auditoría forzada: siete avisos transitivos de producción (cuatro altos, tres moderados), sin críticos. node-forge 1.4.0 procede del tooling Expo CLI/firma de desarrollo y el aviso GHSA-86w9-cpqp-85rv aún no tiene parche publicado; no se usa en el cliente de sesión. decode-uri-component 0.2.2 llega vía query-string 7.1.3/Router y tiene GHSA-vcc3-ghjq-m6fr. Su parche 0.5.1 cambió de CommonJS a ESM: no se impuso un override incompatible ni se degradó Expo/actualizó Router a otro SDK. Revisar una actualización soportada y repetir verificación antes de distribuir en tiendas. Esto no cambia la auditoría sin avisos de producción de la web. La primera entrega es desarrollo/consulta, no aprobación de seguridad para tiendas.

Referencias oficiales consultadas: [SDK 57 Font](https://docs.expo.dev/versions/v57.0.0/sdk/font/), [Expo CLI](https://docs.expo.dev/more/expo-cli/), [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv) y [decode-uri-component](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr). No hay firma ni cuentas de tiendas configuradas; no se contrataron servicios ni se trasladaron cuentas de prueba.

## T185 · Preparación de prueba remota

Controles disponibles desde la raíz: mobile:dev, mobile:login, mobile:check y mobile:bundle. CI incluye un trabajo independiente de Expo (instalaciones separadas, lint/tipos/sesión, exportación de ambas plataformas y pantallas). La variante local con CI=1 pasó sus cuatro pruebas de interfaz. Esto valida el comando, no un trabajo ejecutado por GitHub; su startup_failure continúa pendiente.

Se preparó el despliegue protegido `dpl_4oP53eMvsERAkw3f9ec4B5BroYKs`, source `cf38b907a4477290f9d1088f744402b6b629f092`, BUILD_ID `cefb52e61feb46d4944d84fc776f95cc`, y recuperación compatible `dpl_3ffHvzqJvyZWMq9eDSegRhB7zmMz`, mismo código, BUILD_ID `e8e079d4bef0489b98d37e9eebfa756d`. Ambos READY/production, acceso y worker de 64 recursos con borradores v1/v2/v3 sin skipWaiting verificados. GET móvil sin bearer devuelve 401 JSON privado y login con cuerpo vacío devuelve 400, sin probar credenciales del propietario. El conector confundió el 401 de aplicación con protección Vercel: se comprobó usando vercel curl con la identidad existente, sin desactivar protección. Se conserva la promoción manual; aún no se declara promovida la API aquí.

Túnel Metro HTTPS respondió con manifiestos SDK 57 correctos para Android e iOS. Esto no acredita aceptación física ni acceso de Expo Go: [Expo Go en iPhone exige login en CLI y teléfono con la misma cuenta](https://expo.dev/changelog/expo-go-57-login). CLI no tenía sesión; se solicitó al propietario completar el acceso privado por navegador. La autorización necesita el navegador de este computador para su callback localhost. No se creó una cuenta ni se compartieron contraseñas. La prueba física y la generación de instaladores firmados siguen pendientes.

Los bundles exportados no incluyen referencias a cliente administrativo, claves sb_secret_, service_role o importaciones next/headers. Esa búsqueda complementa, sin sustituir, la separación de importaciones de contratos puros. Se verificó por comparación de huellas que perfiles, programas, prescripciones y entrenamientos de la base interactiva local se conservaron. La regresión completa de 198 E2E de web estaba en curso al preparar este apartado; el resultado final debe registrarse después, sin presentarlo anticipadamente como aprobado.

Ajuste de T185 para CI: los nuevos tests no deben rechazar la pila que el workflow existente crea dentro de un runner efímero de GitHub. Guarda compartida con prueba previa en rojo, aplicada antes de crear el cliente o registrar hooks de integración (afterAll también corre si falla beforeAll): permite 55321 local o exactamente 54321 con CI/GITHUB_ACTIONS true y RUNNER_ENVIRONMENT github-hosted; rechaza la base interactiva local, CI=1 solo, runners propios y cualquier URL remota. Variables contrastadas con la [referencia de GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/variables). No se conectó a 54321 para probar esta excepción ni se ejecutaron tests destructivos allí. El nuevo caso aumenta las unitarias a 514.

## Cierre publicado de software

La regresión de web terminó: **197 E2E aprobadas y un skip CDP previsto**, sin fallos/reintentos (32,1 minutos). Check final completo desde el estado limpio 6f76d06: **514 unitarias**, formato, lint sin errores (diez avisos existentes), tipos y build Next 16.4.3 con 64 recursos. Los cinco casos de integración móvil volvieron a pasar después del ajuste de guarda; antes habían aprobado las 275 de integración completas. No se repitió pgTAP al no existir SQL nuevo. La huella de la app interactiva conserva perfiles, programas, prescripciones y entrenamientos.

La API está publicada en https://iron-strength-seven.vercel.app: E dpl_4oP53eMvsERAkw3f9ec4B5BroYKs, source cf38b90, BUILD_ID cefb52e61feb46d4944d84fc776f95cc. Mismo artefacto preparado y promovido, alias confirmado y promoción automática desactivada otra vez. F conserva recuperación compatible con el mismo contrato. Dieciséis comprobaciones públicas, incluidas 401 JSON privado sin bearer y 400 ante cuerpo vacío de login; recursos/hash/worker y rutas web privadas correctos. No se probaron claves reales del propietario, crearon usuarios, sembraron programas o aplicaron migraciones nuevas. CI 39978567518 terminó startup_failure con cero trabajos; no se afirma ejecución de los nuevos jobs. Los commits de comandos, CI, guarda de pruebas y documentación posteriores no cambian el código web/API de cf38b90.

El acceso de Expo quedó visible en una pestaña de Codex y marcado para continuar con el propietario; no se introdujeron credenciales. T185 permanece pendiente solo de ese acceso y de la prueba física. No se declara aceptación de iPhone/Android, instalador firmado o publicación en tiendas. La exportación y el túnel son evidencias de desarrollo separadas. Archivos de prueba y respaldos permanecen fuera de Git.

## Conexión y QR de Expo Go — 24 de octubre de 2026

El propietario completó el alta y aprobó personalmente el acceso de Expo CLI. whoami devuelve domarchi. Vinculación por el ID existente 1374e5c4-2620-4034-b8b7-e32e479ff9c8, sin force ni nuevo proyecto: EAS confirmó @domarchis/iron-strength-mobile. El propietario EAS domarchis y el usuario autorizado domarchi son identidades distintas verificadas; app.json conserva owner/projectId públicos devueltos por la CLI. No se subieron claves, lanzaron builds, configuraron tiendas o contrataron servicios.

Metro reiniciado con la sesión autenticada. Dos manifiestos por HTTPS y sus bundles Android/iOS devolvieron 200 con slug, owner, SDK 57 y projectId esperados. La API pública sin sesión sigue rechazando con 401/no-store. Evidencia privada native-preview-verification-20261024.json, con tamaños y SHA256; no equivale a ejecutar la app en un teléfono. QR generado desde el enlace exacto del túnel usando la misma biblioteca toqr de Expo CLI; enlace temporal dependiente del computador y Metro activos.

mobile:check aprobado: lint, tipos y once pruebas. expo-doctor 21/21 aprobado. Solo cambió la vinculación pública del proyecto, sin cambios de pantallas, contratos o SQL; no se repitieron los tests destructivos o la suite web completa por estos metadatos. La aceptación física de Expo Go permanece pendiente y T185 conserva ese límite.

## T186 · Incompatibilidad física SDK 58/57 — 24 de octubre de 2026

El propietario comunicó que Expo Go se cerraba al cargar. La captura posterior aporta una causa verificable: el Expo Go instalado corresponde a SDK 58.0.0 y rechaza el proyecto SDK 57. No se atribuye a hardware, iOS o una incidencia externa sin diagnóstico del teléfono. La apertura física anterior queda fallida, aunque el manifiesto y los bundles HTTP habían respondido correctamente.

Spec/tarea actualizadas antes de las dependencias. Las once pruebas del cliente pasaron antes del cambio. Actualización con expo install a Expo 58.0.19, Router 58.0.26, React 19.3.0, RN 0.88.0 y paquetes elegidos por el SDK. La instalación incremental falló al resolver peers de Router 57/58; se conservó la instalación previa fuera de Git y se reinstalaron las versiones compatibles desde cero, sin force ni legacy-peer-deps. expo install --fix confirmó alineación.

Verificación posterior:

- Check móvil: lint, tipos y once pruebas aprobadas.
- expo-doctor: 20/20 comprobaciones aprobadas.
- Exportación Hermes Android/iOS aprobada; no genera APK/IPA firmada.
- Expo web: cuatro E2E Chromium/WebKit aprobadas sin reintentos, 16,1 s. La primera ejecución no pudo lanzar navegadores por faltar sus binarios en la caché predeterminada. Se usaron después los navegadores y bibliotecas locales preparados para el proyecto mediante PLAYWRIGHT_BROWSERS_PATH/LD_LIBRARY_PATH; no se ocultaron errores de la app.
- Check raíz completo: formato, lint sin errores, tipos, 514 unitarias y build Next 16.4.3 con 64 recursos aprobados. No cambió código web/API ni SQL; no se repitieron integración destructiva/pgTAP o las 198 E2E de web por la actualización de dependencias del cliente móvil.
- Metro reiniciado con caché limpia, sin CI/EXPO_OFFLINE y proveedor ngrok explícito, conservando el túnel. La implementación oficial omite anunciar sesiones de desarrollo cuando CI está activo; se corrigió la invocación de prueba y Expo aceptó el anuncio autenticado. No cambiar los jobs de CI por esta necesidad interactiva.
- Dos manifiestos HTTPS declaran SDK 58, owner/proyecto esperados y bundles Android/iOS con respuesta 200. La página HTTPS de apertura devuelve 200 y su botón Expo Go redirige 307 al mismo host con esquema exps y parámetros __expo_ de SDK 58. La primera aserción de diagnóstico esperaba el enlace exp exacto de SDK 57; se ajustó a la nueva salida oficial, sin modificar el launcher ni eliminar sus parámetros. Evidencia privada native-sdk58-remote-verification-20261024.json.

Auditoría actual de dependencias móviles de producción: cinco avisos altos y cero críticos; ya no aparecen los moderados de decode-uri-component. Persisten node-forge/tooling y un aviso de Zod <4.6.6, revisado el 23 de octubre. No se ejecutó audit fix --force (propone bajar Expo a SDK 54), alteró el backend publicado o declaró aprobada la distribución a tiendas. La revisión de dependencias compartidas y transitivas queda pendiente antes de esa distribución. [Aviso Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

Se conservan cuenta Expo, proyecto EAS, credenciales, API y base. No hubo seeds, migraciones, contratación de servicios, firma o builds remotos. El propietario debe repetir acceso → Mi semana → Ver rutina en su iPhone con SDK 58; hasta recibir ese resultado, T185/T186 siguen pendientes de aceptación física. Referencias: [SDK 58](https://expo.dev/changelog/sdk-58), [actualización oficial](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).
