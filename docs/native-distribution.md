# Preparar e instalar las versiones móviles

El [preview Android actual, 0.1.0/build 5](https://expo.dev/accounts/domarchis/projects/iron-strength-mobile/builds/3bf1efbc-2481-45eb-af86-a39783b9af39) incluye T210–T221 y usa la API publicada en https://iron-strength-seven.vercel.app. El preview 4 queda como referencia histórica. El simulador iOS vigente es build 7, con mapa/bundle del mismo trabajo y permisos verificados. El build 6 se conserva como diagnóstico por sus permisos restrictivos. Su arranque y reapertura sin sesión están comprobados en un simulador remoto. El circuito autenticado iOS se verificó por separado en quality7 contra QA. T201–T205 siguen abiertos para teléfonos reales, candidato de producción, CI, beta y tiendas.

## Preview5 · 29 de octubre de 2026

Android: paquete com.domarchis.ironstrength.preview, versionCode 5, Expo 58.0.21 / React Native 0.88.1. APK de 111861087 bytes, SHA-256 `cd74aee20149d407e4c43e8905ac7b79920bc5c4d6bd2f65a3fc920fd076b3e8`. Conserva el certificado EAS de preview 4 y los mismos siete permisos efectivos; almacenamiento externo y superposición ausentes. Incluye arm64-v8a, armeabi-v7a, x86 y x86_64; las 56 bibliotecas de 64 bits cumplen alineación ELF/empaquetado de 16 KB.

La construcción local empezó con el árbol preparado antes del commit; sus 899 archivos de cliente/reglas y 196 contenidos de fuentes del mapa real se contrastaron con b081be512c3c1b98ed20cac2053425d4d4e36aec. Bundle Hermes extraído del APK idéntico al generado por Gradle. La subida local informa fingerprint Unknown: no se inventa ese metadato. La copia redescargada de EAS tiene el mismo SHA-256 que el APK instalado en ambos emuladores.

Actualización 4→5 sin desinstalar en emuladores propios de 4096/16384 bytes por página: un marcador privado creado antes de actualizar se conserva y se retira al finalizar; apertura fría en modo avión, acceso visible, proceso vivo y sin fatal propio. La primera observación de 4 KB encontró un diálogo de System UI; se conservó la evidencia, se eligió Wait y se repitió el arranque. Esto acredita instalación/apertura en emuladores, no un entrenamiento contra producción ni aceptación física.

[iOS para simulador, 0.1.0/build 5](https://expo.dev/accounts/domarchis/projects/iron-strength-mobile/builds/ca6664d1-9c61-4c59-b0db-21d40871f374): fuente b081be5, archivo de 28817702 bytes, SHA-256 `eb20076a55bd1723032269494a9ebd851d577b956eb88a281264a047bef67e73`. Info.plist y ambas arquitecturas Mach-O (arm64/x86_64) declaran simulador; Hermes usa la API publicada. Once manifiestos de privacidad inspeccionados. No se ejecutó en este host Linux, no se obtuvo el mapa de su build real y no es un instalador firmado para iPhone.

## Simulador iOS · build 7 · 30 de octubre de 2026

[Build EAS df9f77c5-9b74-4659-bde0-9cce10d81eae](https://expo.dev/accounts/domarchis/projects/iron-strength-mobile/builds/df9f77c5-9b74-4659-bde0-9cce10d81eae), fuente `a31c565c0dbded76bb2486a08d3df10d8b085441`, 0.1.0/build 7. Archivo de 28387419 bytes, SHA-256 `955d88089e0febc037d687b9adbae53242c830fe37fbd7c70c8c9e59ff3b413a`. Info.plist y Mach-O arm64/x86_64 declaran simulador. Bundle 0644, todos los recursos de la app con lectura y tres diagnósticos separados en 0600, verificados en los tar originales. No se modificó el paquete descargado.

Bundle y mapa coinciden con sus hashes/196 fuentes y contexto Router de 30 rutas: conservan los mismos bytes del diagnóstico 6 porque no cambió el JavaScript. El recibo pertenece al nuevo ID/commit. Auditoría de ubicaciones afectadas sobre mapas reales Android preview5 e iOS build 7 aprobada; diez avisos de herramientas se conservan. Arranque y reapertura nativos sin sesión comprobados en el workflow `01a18b0e-7058-7278-b10c-69a2823028a9`, con tres capturas originales revisadas en iPhone Duo/iOS 27.1. No acredita entrenamiento autenticado, un iPhone físico, firma de dispositivo o envío a tiendas. El campo de cifrado de App Store Connect sigue sin declararse en este simulador y se revisará antes del candidato de producción.

## Simulador iOS build 6 · diagnóstico · 30 de octubre de 2026

[Build EAS 76c753ec-7dc9-4bb8-b5aa-dfafe757dac0](https://expo.dev/accounts/domarchis/projects/iron-strength-mobile/builds/76c753ec-7dc9-4bb8-b5aa-dfafe757dac0), fuente `423aa6e49b57a58ae1ea4762c309826a8bd830a0`, 0.1.0/build 6. Archivo de 28387500 bytes, SHA-256 `66b390569a70f307be79c1fd34d660847f45036084e9a12d9335605d073be2da`. Info.plist y Mach-O arm64/x86_64 declaran iPhoneSimulator; API productiva y once manifiestos de privacidad inspeccionados. Es una referencia de simulador sin ejecución en este host Linux ni firma para un iPhone.

Los tres artefactos adicionales se descargaron del mismo trabajo: bundle Hermes de 3822564 bytes, mapa de 10656158 bytes/1575 fuentes y recibo con ID/commit/hashes. El bundle es idéntico byte por byte al extraído de la aplicación, y los 196 contenidos propios coinciden con la fuente. El contexto virtual de Router reproduce exactamente la plantilla Metro instalada y sus 30 rutas. Los diagnósticos están fuera de la app; no hay mapa incorporado ni datos de usuarios. Auditoría sobre mapas reales Android preview5/iOS build 6: los módulos afectados conocidos no aparecen; diez avisos del árbol instalado se conservan. Detalles en docs/native-dependency-audit.md.

La inspección posterior detectó main.jsbundle con permiso 0600 frente al 0644 de build 5. No se distribuye como candidato: la captura se corrige para que umask solo afecte al directorio privado y el capturador rechace bundles sin lectura estándar. Se prepara build 7 y se exige comprobar sus permisos en el archivo real.

El aviso de EAS sobre ITSAppUsesNonExemptEncryption sigue pendiente para la preparación de App Store Connect; ese campo no está declarado en este simulador. No se presenta el recibo de código o los manifiestos de privacidad como formularios de tienda completados. El build5 iOS anterior se conserva como referencia histórica sin su mapa propio.

El registro con los SDK actuales se comprueba aparte usando quality8, firma de depuración y la instancia aislada 55321. Ese APK no se distribuye a alumnos. El preview usa datos reales al entrar con una cuenta real: nunca ejecutar semillas o pruebas destructivas contra su API. Conservar los pendientes y actualizar sobre la instalación existente. Ver docs/native-quality.md y specs/010-private-training/release.md.

## Variantes

| Perfil            | Instalación                                            | Identificador propuesto            | Servidor de desarrollo              |
| ----------------- | ------------------------------------------------------ | ---------------------------------- | ----------------------------------- |
| development       | Herramientas de desarrollo, Android/iPhone autorizados | com.domarchis.ironstrength.dev     | Sí, expo-dev-client.                |
| preview           | APK Android y ad hoc iOS, con bundle incluido          | com.domarchis.ironstrength.preview | No.                                 |
| preview-simulator | Simulador iOS, hereda preview                          | com.domarchis.ironstrength.preview | No; no se instala en iPhone físico. |
| production        | AAB Google Play / iOS para App Store o TestFlight      | com.domarchis.ironstrength         | No.                                 |

Son propuestas locales: verificar disponibilidad y titular antes de registrarlas. app.config.js resuelve nombres y esquemas distintos; una variante desconocida produce error. APP_VARIANT omitida conserva Iron Strength y iron-strength para Expo Go. El owner domarchis y projectId 1374e5c4-2620-4034-b8b7-e32e479ff9c8 no cambian. No se crearon otros proyectos.

Los perfiles apuntan expresamente a la API HTTPS actual. Preview separa instalaciones, no datos del servidor: iniciar sesión con una cuenta real lee/escribe sus propios registros. Nunca ejecutar seeds o pruebas destructivas contra esa API. El entorno de pruebas continúa siendo la pila aislada local. Las instalaciones distintas no comparten automáticamente credenciales o borradores; no desinstalar una versión con pendientes sin resolverlos.

## Verificación antes de construir

1. Desde mobile, comprobar la cuenta autorizada con `npx eas-cli@latest whoami` y el proyecto con `npx eas-cli@latest project:info`.
2. Confirmar identificadores, membresía/equipo Apple y permisos de Play Console del propietario. Revisar cuotas de compilación; no contratar capacidad ni aceptar gastos automáticamente.
3. Inspeccionar configuración con `APP_VARIANT=preview npx expo config --type public`. No imprimir o compartir variables privadas; las EXPO_PUBLIC forman parte del cliente.
4. Verificar archivo que se subirá: incluir reglas compartidas de src y excluir entornos privados, respaldos, credenciales, registros de prueba y artefactos locales. Los comandos EAS se ejecutan desde mobile, según la guía oficial de monorepos.
5. Comprobar versiones locales de app/build, iconos, permisos y dependencias antes de compilar. No se configuró envío automático ni actualizaciones OTA.
6. Para iPhone con distribución ad hoc, comprobar dispositivo registrado y perfil que lo incluya antes de compilar. Los requisitos exactos se confirman con la cuenta del propietario; registrar un dispositivo no equivale a tenerlo provisionado en Apple.

Estos pasos son previos a los comandos de T201 y no se ejecutaron como operaciones remotas de firma o compilación durante T191.

## Comandos de la etapa de binarios

Después de las verificaciones, desde mobile:

```bash
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile preview
```

El resultado preview debe probarse con Metro detenido: entrar, consultar, registrar, recuperar, cerrar y comprobar un único resultado real. La apertura sin conexión de una semana descargada solo se acepta después de T197–T199; una app instalable no añade esa función por sí sola.

Para desarrollo local se mantiene `npm run start` en Expo Go. `npm run dev-client` requiere tener instalado el binario development y usa APP_VARIANT=development (shell POSIX). El cliente de desarrollo no es el instalador preview independiente. Ningún comando de esta guía declara una publicación en tiendas.

## Firma y mantenimiento

Conservar claves de firma en el sistema de credenciales autorizado, nunca Git/chat. Registrar responsable, recuperación y acceso a las cuentas antes del lanzamiento. Versionado local: buildNumber iOS 1 y versionCode Android 3 tras retirar permisos heredados del primer APK: incrementar antes de otra entrega que lo requiera; no se modifican contadores remotos automáticamente. Una nueva dependencia nativa requiere recompilar; los cambios compatibles del JavaScript siguen el procedimiento de actualizaciones que se defina y pruebe en la etapa de operación.

La aceptación del diseño se realiza con el prototipo de spec 009; la aceptación del producto exige binarios y teléfonos reales. Los requisitos de privacidad, soporte, borrado y pruebas de tienda se validan antes de enviar el artefacto final.

Referencias oficiales: [perfiles](https://docs.expo.dev/build/eas-json/), [variantes](https://docs.expo.dev/build-reference/variants/), [distribución interna](https://docs.expo.dev/build/internal-distribution/), [monorepos](https://docs.expo.dev/build-reference/build-with-monorepos/), [dev-client SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/dev-client/). Consulta del 24 de octubre de 2026.

T201 bloquea en preview/producción los permisos heredados de almacenamiento externo y superposición mediante android.blockedPermissions. Comprobar su ausencia con aapt2 sobre cada APK final, además de verificar certificado y paquete. El primer APK code 1 es diagnóstico; la nueva entrega debe usar code 2 o posterior y el mismo certificado para conservar datos al actualizar. No desinstalar para aplicar una actualización con borradores pendientes.

## Android preview anterior

[Estado del build anterior en Expo](https://expo.dev/accounts/domarchis/projects/iron-strength-mobile/builds/7372df00-928f-4dc6-a714-4760fd192147): versión 0.1.0/code 2, paquete com.domarchis.ironstrength.preview, compilación de 5077116. Firma y manifiesto comprobados; actualizado en emulador Android 16 y abierto en frío en modo avión. Es un APK Android, no una instalación para iPhone ni un envío a Google Play. No usar este instalador para una nueva beta: el cierre de confirmación se corrigió en el código T202 y el reemplazo code 3 debe verificarse antes de distribuir. El cliente usa la API real al entrar con tu cuenta. La prueba completa del registro/offline y los teléfonos reales se documentan por separado. iPhone necesita la membresía/perfil de dispositivo del propietario antes de construir.

## Android preview histórico · 25 de octubre de 2026

[Build 4 en Expo](https://expo.dev/accounts/domarchis/projects/iron-strength-mobile/builds/91d38132-87fe-4aca-aae4-368f0076dae8). APK de 111167087 bytes, SHA-256 66d70d4505a64b5cb5674238112a2b5edf0247b74bbd5bf0cf724bece6d5056f. Paquete com.domarchis.ironstrength.preview y mismo certificado EAS anterior. Siete permisos efectivos; almacenamiento externo y superposición ausentes. Bibliotecas de 64 bits con LOAD y empaquetado alineados a 16 KB.

Instalado sin desinstalar en AVD propios: de code 2 a 4 en 16 KB y de 3 a 4 en 4 KB. Acceso visible en arranque COLD, modo avión y proceso vivo sin fatal nuevo. El AVD de 4 KB mostró antes un bloqueo de System UI; se eligió Wait y se repitió el arranque, sin atribuirlo a la app. El circuito con cuatro cuentas ficticias se ejecutó en quality aislado, con las mismas fuentes móviles y otro origen; no se sembró o entrenó en producción para obtener esta evidencia.

Este APK es para Android y usa la cuenta real existente. La versión preview mantiene una instalación separada de Expo Go, quality y la futura versión de tienda; sus datos locales no se trasladan automáticamente. Consultar docs/native-quality.md antes de las pruebas y conservar cualquier pendiente al actualizar. iPhone necesita su propio binario y provisión; no intentar instalar este APK allí.

## iOS para simulador histórico · 25 de octubre

[Build de simulador en Expo](https://expo.dev/accounts/domarchis/projects/iron-strength-mobile/builds/cf066780-0f66-4f6b-bde1-6454071513a1): 0.1.0/build 1, fuente d34366d, paquete .app universal arm64/x86_64, SDK iphonesimulator27.1 y mínimo iOS 16.4. Info.plist, plataforma Mach-O y bundle Hermes/API verificados. Archivo de 27972086 bytes/SHA-256 b7d8fbf66455352832b524cfb45890f58e3ff120db88f81829044c0172d1d00b. No hay provisión de dispositivo.

Se puede usar con un simulador compatible en macOS; no se ejecutó en este host Linux. El binario para iPhone necesita Apple Developer, registro/provisión apropiados o TestFlight y su propia comprobación. No se solicitó una contraseña Apple, UDID o compra para obtener esta compilación.

## Expo Go remoto con el SDK actual

La copia aislada b081be5 también sirve Expo 58.0.21/RN 0.88.1 en el puerto propio 8087, con la API publicada y sin CI=1. Conserva los Metro anteriores. La conexión actual usa `expo start --go --tunnel ngrok --port 8087 --max-workers 2`: el proveedor predeterminado de este SDK entregó manifiestos, pero su enlace oficial de apertura devolvió 504; ngrok conserva el 307 hacia exps al solicitar HTTPS.

Se comprobaron la página oficial de carga, los manifiestos SDK 58 de ambas plataformas, sus bundles por el túnel y el manifiesto firmado de iOS para el mismo proyecto EAS. El enlace vigente se entrega con el preview y se registra fuera de Git en preview5-go-remote-proof.json. Es temporal mientras este computador y Metro estén activos; no reutilizar enlaces de túneles anteriores. En iPhone, elegir Expo Go y usar la misma cuenta Expo que la CLI (domarchi; el owner del proyecto es domarchis). La cuenta de Iron Strength se usa después dentro de la app y conserva su contraseña propia.

Esto permite revisar el código actual con Expo Go; no es TestFlight, no acredita aceptación física y no sustituye el binario firmado o las pruebas de apertura iPhone sin Metro.

## Verificación autenticada iOS aislada · 30 de octubre

El workflow `01a18ba7-910f-7676-ba42-d7267a216aab` aprobó acceso normal, registro, recuperación fría de serie/foco/descanso, cierre local, otra apertura sin API, respuesta perdida y confirmación idempotente. Usó el simulador quality7 `25302bf7-d1b0-479e-bd8b-3f0bc7b6fe1f` (com.domarchis.ironstrength.quality), fuente706187b y arnés ecaf9ef, con bundle/mapa/recibo del mismo build verificados. SQLite conserva el payload2 congelado antes/después de confirmar; SQL y la API confirman dos series30kg×8/32kg×9 en un único resultado. Cuatro cuentas técnicas comprobaron permisos mediante sesiones normales, sin administración o reset. Los datos demo anteriores se conservan.

Cinco capturas originales de Maestro revisadas; resultado visible en oscuro/claro. Los widgets de sistema del simulador Duo superponen parte de la esquina derecha: esta evidencia no acredita áreas seguras de iPhone Air, teléfono real o contraste AA. No es una IPA, instalación de iPhone, candidato de producción o envío a tiendas. El binario quality usa un origen temporal exclusivamente de pruebas y no se distribuye a alumnos. Los recibos originales, siete intentos fallidos y revisión visual separada se conservan privadamente; detalles en specs/009-product-quality/validation.md.

## Previews vigentes con T222 · 30 de octubre

[Android preview6 en Expo](https://expo.dev/accounts/domarchis/projects/iron-strength-mobile/builds/29cc234b-c9b8-4643-8df5-1c0b45066575):0.1.0/code6, fuente7d9a7e8 y paquete.preview. APK111862119bytes/SHA-256`ee56da331bd2a432b0b0f9c7f27980190e6b6876b7722316e45244b6be290107`; redescarga idéntica. Conserva firma/permisos,56bibliotecas de64bits alineadas16KB y197contenidos propios contrastados con el mapa real. Actualización5→6 sin desinstalar en emuladores4/16KB conserva UID/marcador/SQLite; acceso frío sin red y proceso sin fatal comprobados. Los dos diálogos iniciales System UI y su recuperación con Wait se conservan en la evidencia. Usa la cuenta real/API publicada; las cuentas ficticias de demo pertenecen a otro backend.

[iOS simulador8 en Expo](https://expo.dev/accounts/domarchis/projects/iron-strength-mobile/builds/2833dbc9-ade5-4535-a847-86336bf43244):misma fuente,0.1.0/build8, ambas arquitecturas de simulador y198archivos iguales a la descarga CLI. Archivo28388945bytes/SHA-256`81e0e39c6b0a6e7d863cdfbdec20fe80362c9ee7fae3e9c1d79d7036efa9571d`. Bundle/mapa/recibo del mismo trabajo y197contenidos propios verificados. Workflow01a18c09-e5be-7e31-b65c-36c99e36ca35 aprobó proceso, formulario nativo, oscuro/claro, terminación/reapertura y limpieza; tres PNG originales revisados por separado. El primer intento pasó proceso pero generó capturas negras de simctl, conservadas sin acreditarlas visualmente. El nuevo capturador no escribe credenciales o registros. No es una instalación de iPhone, prueba autenticada, revisión de áreas seguras de Air o publicación en tiendas.

Los previews5/7 permanecen como evidencia anterior y no incluyen T222. No reconstruir o usar latest para repetir la prueba de8: el arnés fija ID/hash. La demo privada/Expo Go sí contiene T222 y usa el backend aislado indicado en su guía privada, sin usuarios ficticios en producción. Mantener el requisito de verificar titular/identificadores reales antes del candidato de tienda y la aceptación física separada.
