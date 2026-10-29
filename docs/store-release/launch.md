# Publicación del candidato probado · T204

Estado: preparación; no se registró una app, subió un binario, invitó a testers o publicó una tienda. Requiere las cuentas del propietario y los pendientes de T201–T203/T205. El registro candidate.template.json conserva nulos los valores aún no comprobados; sus campos no son una puerta automática ni prueban aceptación.

## Identificar el candidato

Los previews actuales sirven para validar el producto: Android usa com.domarchis.ironstrength.preview y un APK; iOS es un .app de simulador. Para tiendas se necesitan AAB e IPA de dispositivo con el identificador de producción confirmado. Los perfiles existentes ya distinguen esos formatos; no editar el APK o renombrarlo para tratarlo como otro producto. [Formatos y envío oficiales de Expo](https://docs.expo.dev/deploy/submit-to-app-stores/).

Antes de construir, confirmar titular, identificadores y destino en las consolas, además de cuota y firma. Revisar la configuración pública resuelta, API productiva, permisos y ausencia de material privado en el archivo de subida. Incorporar los iconos y recursos finales revisados antes del build. Registrar commit, build EAS, identificador, versión, hash, fecha y evidencia de las comprobaciones. Las contraseñas, claves y listas de personas se mantienen fuera del manifiesto y de Git.

El AAB que llegue a Play debe probarse mediante su distribución de prueba. Registrar por separado la clave de subida y el certificado con el que Play firma los APK distribuidos; no exigir que coincidan con la firma del preview ni comparar el hash del APK derivado con el AAB. [Firma oficial de Android](https://developer.android.com/studio/publish/app-signing).

El IPA debe corresponder al dispositivo y equipo Apple correctos. Subirlo a App Store Connect permite distribuirlo por TestFlight después de su procesamiento; esa subida no lo publica automáticamente en App Store. Seleccionar después el mismo build probado para la versión que se envía a revisión. [Expo Submit](https://docs.expo.dev/deploy/submit-to-app-stores/), [selección del build en Apple](https://developer.apple.com/help/app-store-connect/manage-builds/choose-a-build-to-submit/).

## Ampliar la beta

1. Probar el candidato de tienda con el coach: acceso, consulta sin iniciar, registro, recuperación y cierre confirmado. Usar su propia cuenta para entrenar y web para planificar.
2. Incorporar a los tres alumnos reales en el canal privado adecuado. Registrar dispositivo/OS, versión, resultado y problemas con el formato de docs/phone-validation.md y docs/native-quality.md. Cada persona ve y registra solo lo suyo. Las cuentas ficticias de QA no se trasladan a producción.
3. Resolver fallos bloqueantes y verificar respaldo/recuperación, enlaces de acceso, políticas públicas y CI. Registrar la evidencia física; una compilación o captura del emulador no la sustituye.
4. Completar los requisitos adicionales que muestre la consola. Para una cuenta personal nueva de Google, la prueba cerrada exige doce testers inscritos continuamente durante catorce días antes de solicitar producción. Un piloto interno con cuatro personas no cumple ese requisito, y cumplirlo no equivale a aprobación de producción. [Requisito oficial](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

En TestFlight usar el grupo y revisión de beta correspondientes. No otorgar a alumnos permisos administrativos de App Store Connect para facilitarles una instalación. El propietario identifica a los participantes y autoriza el envío de invitaciones antes de contactar a personas. [TestFlight oficial](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

## Publicar la primera versión

La gradualidad inicial se realiza ampliando la beta antes de abrir la distribución pública. Google no ofrece porcentajes para una primera publicación: el lanzamiento inicial llega a los usuarios de los países/regiones elegidos. Apple reserva phased release para versiones posteriores. No presentar un piloto privado como una publicación pública al 1 %. [Primera publicación en Google](https://support.google.com/googleplay/android-developer/answer/9859348?hl=en), [límite de Apple](https://developer.apple.com/documentation/appstoreconnectapi/app-store-version-phased-releases).

Con los controles anteriores aprobados, preparar una revisión concreta para el propietario: fichas y capturas finales, políticas/soporte/eliminación funcionales, países/regiones, cuenta de revisión por el canal privado de cada tienda, referencias exactas del AAB/build iOS y resultado de beta. El envío y publicación finales conservan esa revisión; no activar auto-submit o publicación inmediata mientras falten sus datos o autorización.

Promover/seleccionar el artefacto ya probado en cada consola. Registrar la versión y el identificador que devuelve la tienda y comprobar la disponibilidad real mediante sus enlaces y una instalación en teléfono. Un cambio en código, iconos, capacidades o configuración nativa necesita nuevo build y nueva validación. Los cambios solo de ficha se revisan como metadatos, sin afirmar que haya cambiado un binario.

Para actualizaciones posteriores, contrastar de nuevo las opciones y elegibilidad de despliegue por fases. Apple permite descargar manualmente una actualización aunque esté en phased release; el porcentaje no es una barrera de acceso. [Actualizaciones de Apple](https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases), [actualizaciones de Google](https://support.google.com/googleplay/android-developer/answer/6346149?hl=en-en).

## Detener y recuperar

No ampliar la beta o publicar con cierres reproducibles, pérdida de borradores, duplicación, acceso ajeno o políticas/enlaces de acceso rotos. Conservar evidencias privadas mínimas; resolver y repetir el recorrido afectado sobre un candidato nuevo cuando cambie el binario.

Detener la distribución no retira las instalaciones ya recibidas. No pedir desinstalar una app con pendientes ni intentar volver a un versionCode menor. Mantener API/formatos compatibles y preparar la corrección con versión superior y misma identidad/firma de distribución. Recuperar web mediante el artefacto compatible T221 de docs/operations.md conserva la base; no usar L/K o N para los registros tipados nuevos. No se autoriza revertir migraciones o eliminar datos locales de teléfonos.

Fuentes revisadas el 25 de octubre de 2026. Los límites y acciones se vuelven a contrastar con las cuentas reales antes de enviar. T204 termina con disponibilidad comprobada en ambas tiendas y sus evidencias; este procedimiento no la marca completa.
