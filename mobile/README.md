# Iron Strength · Android e iPhone

Primera entrega aprobada: **acceso con la cuenta existente, Mi semana y consulta de rutina**. Incluye objetivos por serie, superseries, descanso, indicaciones y alternativas. El coach continúa planificando en la web. La consulta no inicia un cronómetro ni crea entrenamientos. El registro nativo y las descargas todavía no están implementados.

## Desarrollo

Desde la raíz del repositorio, instalar `npm ci`; después, en `mobile`, ejecutar `npm ci`. Son instalaciones independientes: no compartir node_modules de React entre Next y Expo. SDK 57 se eligió para la versión de Expo Go disponible al comenzar; `npx expo-doctor` comprueba compatibilidad. No editar carpetas ios/android generadas.

- `npm start`: Expo Go en la red local.
- `npm start -- --tunnel --go`: enlace temporal para otra red. El computador debe permanecer encendido y Metro activo. El túnel sirve una versión de desarrollo, no una app publicada en tiendas.
- `npm run check`: lint, tipos y pruebas de sesión.
- `npm run test:ui`: pantallas de Expo web con API sintética interceptada, Chromium y WebKit. Requiere los navegadores de Playwright instalados desde la raíz. No consulta ni siembra producción.
- `npm run bundle`: exporta JavaScript/Hermes y recursos de Android e iOS. **No genera APK/IPA ni firma un instalador.**

El origen de producción por defecto es https://iron-strength-seven.vercel.app. `.env.example` contiene solo configuración pública. Para desarrollo local se requieren ambas variables EXPO_PUBLIC_API_URL y EXPO_PUBLIC_ALLOW_LOCAL_API=1; el permiso HTTP solo funciona en desarrollo. Un teléfono no puede alcanzar el localhost del computador: usar la dirección de su red cuando corresponda. Nunca incluir claves Supabase administrativas en variables EXPO_PUBLIC.

## Sesión y privacidad

El servidor ofrece /api/mobile/v1, verifica el usuario y aplica RLS. No usar Server Actions ni cookies del navegador como API móvil. Solo el refresh token se conserva en SecureStore; access token/perfil viven en memoria. La vista web de desarrollo usa memoria y vuelve al acceso al recargar. El borrado local y la renovación se serializan; las respuestas de una sesión anterior no reabren la cuenta. Una desconexión no elimina la credencial guardada.

No hay almacenamiento de rutinas offline en este hito. La salida elimina la sesión del dispositivo y procura revocar esa sesión en el servidor. Sin conexión no se afirma una revocación remota ni el cierre de otros dispositivos.

## Probar en teléfono

Usar Expo Go compatible con SDK 57 y abrir el enlace temporal emitido por Metro. Android permite escanear el QR desde Expo Go; en iPhone se puede abrir desde Cámara o el enlace de Expo. El acceso y las rutinas dependen de la cuenta real existente: esta entrega no crea usuarios o programas ficticios en producción. Sin programa, debe aparecer el estado correspondiente.

Comprobar con cuenta propia: entrar → Mi semana → Ver rutina → objetivos/indicaciones/alternativas → volver → salir. Cerrar y reabrir debe recuperar la sesión; desconectar al recuperar permite reintentar; cerrar sesión no debe cerrar la web. Registrar teclado, lector de pantalla, tamaño de texto, tema y retorno desde segundo plano por separado en specs/008-native-app/validation.md. Expo web no sustituye estos controles físicos.

## Antes de distribuir en tiendas

Faltan prueba física, registro y recuperación nativos, identificadores de aplicación del propietario, cuentas Apple/Google, firma y distribución interna. EAS no está vinculado a una cuenta y no se creó ningún servicio de pago. La auditoría actual conserva avisos transitivos del SDK: revisar la actualización compatible y la exposición antes de una build distribuible; no ejecutar audit fix --force ni degradar Expo a SDK 44 para silenciarlos. Detalle y evidencia en specs/008-native-app/validation.md.
