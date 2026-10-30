# Validación de la app instalada

La interfaz Expo web, el APK en emulador y los teléfonos físicos son evidencias distintas. Una exportación Hermes no acredita instalación; el acceso dibujado sin red no acredita un entrenamiento completo sin conexión. Registrar fecha, commit, plataforma, versión, build, dispositivo y resultado observado.

La revisión de dependencias JavaScript por ubicación de módulos se describe en [native-dependency-audit.md](native-dependency-audit.md). Conserva los avisos de herramientas y exige vincular mapas/bundle al mismo artefacto antes de atribuirle ese resultado; no reemplaza estos recorridos nativos.

## Entorno seguro

- La variante `quality` usa `com.domarchis.ironstrength.quality`, nombre Iron Strength Pruebas y esquema iron-strength-quality. No comparte SQLite ni SecureStore con preview/producción.
- Exige EXPO_PUBLIC_API_URL explícita: origen HTTPS de un túnel temporal trycloudflare.com, sin credenciales, puerto, ruta, consulta ni fragmento. Rechaza el dominio productivo y APP_VARIANT desconocida. EAS_BUILD=true rechaza esta variante salvo la excepción cerrada quality-simulator/ios/IRON_QUALITY_SIMULATOR=1 descrita abajo.
- El backend debe usar Supabase `http://127.0.0.1:55321`. La excepción 54321 solo es válida dentro del runner efímero alojado por GitHub, con las guardas de src/lib/testing/mobile-backend.ts. CI=1 por sí solo no concede esa excepción.
- Antes de preparar cuentas ficticias, verificar el destino. No ejecutar otras suites que limpien esa base mientras dura la prueba nativa. Nunca usar seeds, reset o credenciales administrativas contra producción o la base interactiva.
- El túnel solo expone el Next de pruebas, con autenticación/RLS actuales, datos ficticios y puerto propio. Contrastar BUILD_ID local y remoto antes de compilar. Detenerlo y cerrar el servidor al terminar.

## Compilación local

Mantener la copia de fuentes, Java, SDK, Gradle, AVD y APK fuera del checkout. Copiar solo archivos de origen; excluir .env privados, firmas, respaldos y artefactos. No generar ni editar android/ios a mano dentro del repositorio. Desde la copia móvil, resolver APP_VARIANT=quality y el origen contrastado, ejecutar `expo prebuild --platform android --no-install` y compilar `:app:assembleRelease` con Gradle. Para el AVD x86_64 usar `-PreactNativeArchitectures=x86_64`; no distribuir ese APK como versión para alumnos.

SDK observado en la compilación preview T201: build tools 37.0.0, compile SDK 37, target 36, NDK 27.1.12297006 y CMake 3.22.1. Confirmar versiones de la configuración Expo vigente antes de repetir; el CLI Android actual publica la plataforma como platforms/android-37.0. Verificar hash de herramientas descargadas. La configuración nativa procede de CNG.

Inspeccionar manifiesto, paquete, versión, permisos, firma y bundle del APK resultante. Instalar únicamente en el AVD propio identificado por nombre/serial; no usar adb sin serial cuando existen varios dispositivos. Nunca desinstalar o borrar datos para ocultar un fallo de recuperación. Una actualización real usa el mismo paquete/certificado y un código de versión posterior.

Contrastar `sourcesContent` del mapa Hermes con las fuentes móviles y compartidas de la copia usada para compilar, además del hash del bundle incluido en el APK. Rechazar rutas de otra copia y contenidos distintos. Compartir `node_modules` no debe compartir transformaciones de la raíz de Expo Router: `cacheVersion` incluye la carpeta del proyecto. No limpiar cachés globales ni reiniciar Metro del propietario para corregir una compilación de pruebas. Un origen correcto y una copia de archivos idéntica no acreditan por sí solos el código realmente empaquetado.

## Circuito y evidencia

1. Arrancar sin Metro, probar claro/oscuro y teclado: Siguiente en Correo enfoca Contraseña sin enviar. Ir o Entrar envía una sola petición.
2. Entrar con el alumno ficticio. Consultar rutina sin crear entrenamiento. Descargar la semana y confirmar disponibilidad después de la escritura completa.
3. Probar prescripción por serie, sustitución autorizada y superserie. Calentamientos no avanzan ronda. El descanso conserva su término al cambiar de pantalla, poner la app en segundo plano y volver.
4. Activar modo avión, cerrar forzadamente y abrir. Recuperar cuenta y sesión descargadas. Completar y cerrar dos sesiones distintas; conservar ambos pendientes después de reiniciar.
5. Reconectar con la app abierta, verificar sincronización y volver a intentarla. Consultar la base aislada: exactamente un workout por identificador, con las series y sustituciones correspondientes.
6. Abrir historial, evidencia, progreso y comentarios. Probar borrador de comentario y respuesta sin duplicados. Cambiar de alumno tras resolver pendientes: no mostrar registros del anterior. Probar también el entrenamiento del coach.
7. Revisar tamaños táctiles, texto ampliado, movimiento reducido, teclado, ausencia de desbordamientos y uso de lector de pantalla. Emulador no acredita VoiceOver, rendimiento o aceptación de un teléfono real.

Conservar capturas/jerarquías y errores del paquete de pruebas fuera de Git; nunca publicar tokens, contraseñas, notas, fotos o logs íntegros del servidor. Un fallo se registra antes de corregirlo y repetir el caso. No se sustituye por una captura del prototipo.

## Teléfonos y CI

| Participante | Android físico | iPhone físico |
| ------------ | -------------- | ------------- |
| Coach        | Pendiente      | Pendiente     |
| Alumno 1     | Pendiente      | Pendiente     |
| Alumno 2     | Pendiente      | Pendiente     |
| Alumno 3     | Pendiente      | Pendiente     |

Registrar qué plataformas usan realmente los participantes; no inventar un dispositivo de cada tipo por persona. iPhone necesita Apple Developer/perfil válido para instalar preview o TestFlight. La aceptación física la realiza el propietario con sus participantes y se registra aparte.

GitHub Actions 40169728166 no creó trabajos: la UI indica pagos/límite de gasto. YAML y referencias se comprobaron con actionlint y API; no atribuirlo a un test fallido ni marcarlo verde. El propietario debe revisar Billing & plans. No modificar pagos/límites, crear checks de éxito manuales o disparar repetidamente el mismo bloqueo. Tras resolverlo, ejecutar la configuración vigente y conservar los resultados.

## Arranque remoto de preview7 con herramientas de Apple

La prueba manual `.eas/workflows/ios-preview-smoke.yml` (dentro de mobile) usa un job custom macos-medium, sin job Maestro premium o servicio Maestro Cloud. El plan Free publicado incluye hasta 60 minutos de CI/CD y una concurrencia macOS; comprobar la cuenta/cuota antes de ejecutar, sin contratar capacidad. [Precios de Expo](https://expo.dev/pricing), [workers y funciones oficiales](https://docs.expo.dev/eas/workflows/syntax/).

El workflow descarga exactamente el simulador EAS df9f77c5-9b74-4659-bde0-9cce10d81eae. El script valida identificador, plataforma, versión/build y hash de Hermes, crea un simulador nuevo y guarda capturas de acceso en oscuro/claro y tras una reapertura. Solo opera y retira el UDID recién creado; no usa dispositivos anteriores. No introduce cuentas, pulsa Entrar o escribe datos de usuarios. Los comandos tienen tiempos acotados y la evidencia queda fuera de Git/subidas de código.

El estado del proceso y las imágenes tienen evidencias separadas: revisar las capturas antes de acreditar la pantalla. No convertir este arranque en aprobación del registro autenticado, modo avión, teléfono real o candidato de tienda. No hay triggers automáticos: el operador selecciona esta prueba manualmente desde mobile con `eas workflow:run .eas/workflows/ios-preview-smoke.yml`. Los pins del script/workflow se actualizan deliberadamente después de verificar otro artefacto; nunca se usa latest como versión de la app.

Comprobado el 30-oct: workflow 01a18b0e-7058-7278-b10c-69a2823028a9 aprobado, build 7 instalado/abierto/reabierto y tres capturas originales revisadas en iPhone Duo/iOS 27.1, con limpieza del dispositivo propio. No representa el circuito autenticado o un iPhone físico. El primer intento falló por interpolación literal de env; la ruta de download_build debe exportarse dentro de run. Detalles, hashes y límites en specs/009-product-quality/validation.md.

## Simulador iOS autenticado de QA

La variante quality puede construirse como artefacto privado de simulador en EAS con el perfil quality-simulator. Mantiene su identificador .quality y la misma lógica de acceso/registro; nunca se distribuye a alumnos o tiendas. La excepción exige simultáneamente EAS_BUILD=true, EAS_BUILD_PLATFORM=ios, EAS_BUILD_PROFILE=quality-simulator e IRON_QUALITY_SIMULATOR=1. Todo otro build remoto quality se rechaza, y el origen HTTPS de pruebas sigue siendo obligatorio.

El workflow manual mobile/.eas/workflows/ios-quality-build.yml recibe qa_api_origin, que se contrasta antes con el backend Next conectado únicamente a 55321. Sin origen por defecto, triggers de push, envío a tiendas, cuentas reales o nuevos secretos. No apuntar a producción. Conservar el ID del job y descargar app/mapa/bundle/recibo del mismo trabajo; cotejar API, permisos y fuentes antes de probar. Si la cuota o el plan exige un gasto, detener la compilación sin contratar capacidad.

Este artefacto permite probar SQLite, SecureStore y el registro autenticado en un simulador remoto sin introducir cuentas ficticias en producción. La demo en la pila aislada se conserva; no se resetea ni se ejecutan suites destructivas mientras el propietario la usa. Las pruebas deben ser aditivas y usar cuentas técnicas ficticias existentes. La ejecución, el circuito autenticado y los teléfonos se acreditan por separado.

En el build de workflow, EAS_BUILD_GIT_COMMIT_HASH puede faltar y metadata.gitCommitHash todavía no está poblado en los hooks iniciales. El hook lee git rev-parse HEAD del checkout real y valida sus 40 dígitos; conserva ese valor en IRON_IOS_WORKFLOW_SOURCE_COMMIT. Solo quality-simulator admite esa procedencia y el recibo la identifica como workflow-checkout. Cotejarlo después con la metadata final del build y todas las fuentes del mapa. Si falta Git, el commit es inválido o hay un conflicto, abortar: no sustituir por un input o un valor fijo.

El workflow manual ios-quality-circuit.yml recibe únicamente el build/hash/commit, BUILD_ID/origen aislado y UUID técnico. Sus tres entradas sensibles se preparan en EAS como variables secret del proyecto/preview: IRON_IOS_QUALITY_TEST_EMAIL, IRON_IOS_QUALITY_TEST_PASSWORD e IRON_IOS_QUALITY_PROXY_TOKEN. Comprobar que no existan, registrar los IDs creados y retirarlas al terminar el job; no sustituir variables ajenas, usar correos reales ni incluir claves de Supabase. El runner solo acepta @iron-strength.e2e.test. No publicar las salidas originales de Maestro; solo los logs filtrados, capturas explícitas y prueba técnica. No hay ejecución autenticada acreditada por preparar este workflow.
