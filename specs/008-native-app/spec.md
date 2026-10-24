# Spec 008 — Primera entrega Android/iPhone

Joaquin aprobó React Native con Expo el 23 de octubre de 2026 para acceso con la cuenta actual, Mi semana y consulta de rutina. El coach conserva la planificación web. SDK 58 para coincidir con Expo Go instalado en el iPhone del propietario, Router para navegación y SecureStore para credenciales. La primera versión usó SDK 57; el 24 de octubre el propietario aportó la pantalla que confirma la incompatibilidad con su Expo Go SDK 58. No contratar servicios, crear cuentas por el usuario o enviar a tiendas en este hito. Expo Go en iPhone exige que el propietario autentique la misma cuenta Expo en CLI y teléfono; es un acceso de desarrollo distinto de la cuenta Iron Strength. Un manifiesto HTTP disponible no acredita que Expo Go permita abrir la app sin ese acceso.

La primera entrega es de consulta: no inicia cronómetro, borrador o entrenamiento. Incluye estados sin programa, futuro/terminado, sesiones con avance, prescripción uniforme/detallada, grupos, descanso e indicaciones/alternativas. Conserva Azul atleta y sigue el tema del sistema. El registro nativo completo y las descargas SQLite son entregas posteriores de la propuesta.

## Contrato HTTP v1

Endpoints explícitos bajo /api/mobile/v1: POST auth/login, auth/refresh, auth/logout; GET week y sessions/:UUID. El proxy de cookies los omite; cada handler valida su identidad móvil. Respuestas JSON versionadas con private/no-store y Vary Authorization. Cuerpo limitado a 16 KiB y validación estricta. Errores sin claves, correo, cookies o trazas. No usar el payload como identidad.

Login reutiliza attemptLogin y el mismo control de intentos por correo, sin ampliar los tres propósitos administrativos existentes. El SDK autenticado del usuario lee su perfil activo; el móvil recibe access token, refresh token, vencimiento y perfil. Refresh valida de nuevo el perfil. Las lecturas usan un cliente nuevo por petición con JWT verificado por Auth y RLS, y derivan el alumno de ese usuario; no aceptan alumno desde query. Sesiones ajenas se responden como no encontradas. No añadir funciones definer, claves administrativas en el binario ni caché de respuestas personales.

Logout revoca solo la sesión móvil cuando hay conexión. El cliente retira únicamente sus credenciales locales y no afirma revocación remota si falla la red. Las peticiones móviles no modifican las cookies de la web ni cierran otras sesiones al salir normalmente.

## Cliente

Solo origen HTTPS en producción; HTTP local explícito para desarrollo. Guardar únicamente refresh token en SecureStore, manteniendo access token/perfil en memoria. Renovar antes de usar un token vencido y una sola vez ante 401. Serializar renovación y evitar que una respuesta tardía de una cuenta se aplique después de salir o cambiar de cuenta. Fallo de red al recuperar no elimina credenciales; token rechazado por el servidor sí vuelve a acceso. Fallo de almacenamiento no anuncia sesión persistente.

Router protege pantallas y el servidor sigue siendo la autoridad. Consultar rutina no escribe datos. Estados de carga, error y reintento, teclado, objetivos táctiles de 44 px y texto ampliable. La vista web de desarrollo usa memoria para credenciales, sin persistir tokens en localStorage. Configuración de producción apunta solo al origen aprobado. Los recursos se reutilizan desde el arte existente.

## Verificación

Primero pruebas de contratos, límites, identidad, cabeceras, renovación, almacenamiento y respuestas tardías. Integración local solo en Supabase aislado 55321; el CI existente crea Supabase 54321 dentro de una VM efímera de GitHub. Permitir esa segunda URL solo si CI y GITHUB_ACTIONS son true y RUNNER_ENVIRONMENT es github-hosted; nunca por CI=1 solo o en runners propios. Rechazar URLs remotas y la base interactiva local antes de limpiar. Pruebas: bloqueo de intentos, alumno propio/ajeno, perfil desactivado, consulta sin escrituras y coach entrenando. Tipos/lint/bundles Android e iOS; pruebas de pantallas según herramientas disponibles. Emulación, exportación JavaScript, APK/IPA firmada y aceptación física se registran como evidencias distintas. No se atribuye una prueba física a Expo web.

## Conexión de desarrollo — 24 de octubre de 2026

El propietario completó el alta y autorizó Expo CLI. Vincular únicamente el proyecto existente iron-strength-mobile del propietario EAS domarchis (usuario autorizado domarchi), ID 1374e5c4-2620-4034-b8b7-e32e479ff9c8, conservando el código actual. Comprobar identidad y configuración antes de reiniciar el túnel. No crear otro proyecto, lanzar builds en la nube, configurar firma o contratar servicios como parte de esta conexión. Guardar solo owner/projectId públicos en app.json; las credenciales de CLI quedan fuera del repositorio. El enlace temporal y los manifiestos no acreditan una prueba física.

## T186 · Compatibilidad con el teléfono del propietario

Actualizar de SDK 57 a SDK 58 y alinear los paquetes con expo install, sin cambiar funciones, credenciales, API o base. Mantener las pruebas previas de sesión y recorrido, exportar Android/iOS y ejecutar expo-doctor. Reiniciar Metro con caché limpia y sin CI: CI impide anunciar la sesión de desarrollo a Expo Go. Verificar manifiesto SDK 58, recursos y enlace HTTPS con botón Expo Go. Conservar el proyecto EAS y la cuenta ya autorizados. La aceptación requiere que el propietario abra acceso y Mi semana en el teléfono; las pruebas automatizadas no sustituyen ese resultado. No atribuir un cierre nativo a una incidencia externa sin evidencia del dispositivo.
