# Iron Strength · Android e iPhone

Cliente móvil: **acceso con la cuenta existente, Inicio, Entrenar, Historial, Progreso y Cuenta**. Incluye vista previa, registro de series, objetivos por serie, superseries, descanso, alternativas, cierre con esfuerzo/nota y recuperación local. La consulta no inicia un entrenamiento: hay una acción explícita para empezar. El coach continúa planificando en la web. Las descargas completas de semanas y la distribución en tiendas siguen pendientes.

## Desarrollo

Desde la raíz del repositorio, instalar `npm ci`; después, en `mobile`, ejecutar `npm ci`. Son instalaciones independientes: no compartir node_modules de React entre Next y Expo. La app usa SDK 58 para coincidir con el Expo Go instalado en el iPhone del propietario; `npx expo-doctor` comprueba compatibilidad de paquetes. La primera entrega usó SDK 57, que ese Expo Go rechaza explícitamente. No editar carpetas ios/android generadas.

- `npm start`: Expo Go en la red local.
- `npm start -- --tunnel --go`: enlace temporal para otra red. El computador debe permanecer encendido y Metro activo. El túnel sirve una versión de desarrollo, no una app publicada en tiendas.
- `npm run check`: lint, tipos y pruebas de sesión.
- `npm run test:ui`: pantallas de Expo web con API sintética interceptada, Chromium y WebKit. Requiere los navegadores de Playwright instalados desde la raíz. No consulta ni siembra producción.
- `npm run bundle`: exporta JavaScript/Hermes y recursos de Android e iOS. **No genera APK/IPA ni firma un instalador.**

La prueba del propietario se inicia sin CI ni EXPO_OFFLINE: esos modos omiten anunciar el servidor en Expo Go. Al cambiar de SDK, reiniciar con `npm start -- --tunnel --go --clear` y comprobar que el manifiesto declara 58. El enlace HTTPS `/_expo/loading?platform=ios` ofrece un botón Expo Go para abrir desde el mismo teléfono sin escanear un QR. La presencia del proyecto en Projects no acredita que haya un servidor conectado o que la versión sea compatible.

El origen de producción por defecto es https://iron-strength-seven.vercel.app. `.env.example` contiene solo configuración pública. Para desarrollo local se requieren ambas variables EXPO_PUBLIC_API_URL y EXPO_PUBLIC_ALLOW_LOCAL_API=1; el permiso HTTP solo funciona en desarrollo. Un teléfono no puede alcanzar el localhost del computador: usar la dirección de su red cuando corresponda. Nunca incluir claves Supabase administrativas en variables EXPO_PUBLIC.

## Sesión y privacidad

El servidor ofrece /api/mobile/v1, verifica el usuario y aplica RLS. No usar Server Actions ni cookies del navegador como API móvil. Solo el refresh token se conserva en SecureStore; access token/perfil viven en memoria. La vista web de desarrollo usa memoria y vuelve al acceso al recargar. El borrado local y la renovación se serializan; las respuestas de una sesión anterior no reabren la cuenta. Una desconexión no elimina la credencial guardada.

El registro iniciado y su instantánea se conservan por cuenta en SQLite del dispositivo. El cierre congela el payload antes de enviarlo: los reintentos usan el mismo ID y contenido. Una respuesta perdida o una sesión expirada no eliminan el pendiente. No hay descarga de semanas completas ni promesa de apertura en frío sin conexión; recuperar la sesión de acceso exige conexión al servidor. Antes de salir hay que enviar/retomar o descartar explícitamente el entrenamiento pendiente. La salida retira los datos locales de esa cuenta y procura revocar solo su sesión móvil. Sin conexión no se afirma revocación remota.

## Probar en teléfono

Usar Expo Go compatible con SDK 58. Para iPhone, iniciar sesión en Expo Go y en la CLI con la misma cuenta Expo: desde la raíz ejecutar `npm run mobile:login`, completar el acceso en el navegador de este computador y reiniciar Metro. No pegar contraseñas ni códigos en el chat. Este acceso de desarrollo es distinto de la cuenta de Iron Strength dentro de la app. [Requisito oficial de Expo Go](https://expo.dev/changelog/expo-go-57-login). Después abrir el enlace temporal emitido por Metro. Android permite escanear el QR desde Expo Go; en iPhone se puede abrir desde Cámara o el enlace de Expo. El acceso y las rutinas dependen de la cuenta real existente: esta entrega no crea usuarios o programas ficticios en producción. Sin programa, debe aparecer el estado correspondiente.

Comprobar con cuenta propia: entrar → Inicio → Ver rutina → empezar → registrar kg/repeticiones → completar serie → finalizar → guardar → resultado → historial/progreso → Cuenta → salir. Sin programa, Entrenar ofrece tres sesiones demo: ver, probar, recuperar y terminar. Sus resultados quedan marcados DEMO en el dispositivo, no se asigna un programa ficticio ni se envían entrenamientos de ejemplo al coach. Cerrar y reabrir debe recuperar la sesión; desconectar al recuperar permite reintentar; cerrar sesión no debe cerrar la web. Registrar teclado, lector de pantalla, tamaño de texto, tema y retorno desde segundo plano por separado en specs/008-native-app/validation.md. Expo web no sustituye estos controles físicos.

## Antes de distribuir en tiendas

Faltan aceptación física del nuevo registro, descarga de semanas, identificadores de aplicación del propietario, cuentas Apple/Google, firma y distribución interna. EAS está vinculado al proyecto existente @domarchis/iron-strength-mobile (1374e5c4-2620-4034-b8b7-e32e479ff9c8); la CLI está autorizada como domarchi. No se lanzó ningún build remoto, configuró firma o creó servicio de pago. La auditoría actual conserva avisos transitivos del SDK: revisar la actualización compatible y la exposición antes de una build distribuible; no ejecutar audit fix --force ni degradar Expo a SDK 44 para silenciarlos. Detalle y evidencia en specs/008-native-app/validation.md.
