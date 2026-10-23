# Spec 008 — Primera entrega Android/iPhone

Joaquin aprobó React Native con Expo el 23 de octubre de 2026 para acceso con la cuenta actual, Mi semana y consulta de rutina. El coach conserva la planificación web. SDK 57 explícito para la compatibilidad actual de Expo Go, Router para navegación y SecureStore para credenciales. No contratar servicios, crear cuentas por el usuario o enviar a tiendas en este hito. Expo Go SDK 57 en iPhone exige que el propietario autentique la misma cuenta Expo en CLI y teléfono; es un acceso de desarrollo pendiente, distinto de la cuenta Iron Strength. Un manifiesto HTTP disponible no acredita que Expo Go permita abrir la app sin ese acceso.

La primera entrega es de consulta: no inicia cronómetro, borrador o entrenamiento. Incluye estados sin programa, futuro/terminado, sesiones con avance, prescripción uniforme/detallada, grupos, descanso e indicaciones/alternativas. Conserva Azul atleta y sigue el tema del sistema. El registro nativo completo y las descargas SQLite son entregas posteriores de la propuesta.

## Contrato HTTP v1

Endpoints explícitos bajo /api/mobile/v1: POST auth/login, auth/refresh, auth/logout; GET week y sessions/:UUID. El proxy de cookies los omite; cada handler valida su identidad móvil. Respuestas JSON versionadas con private/no-store y Vary Authorization. Cuerpo limitado a 16 KiB y validación estricta. Errores sin claves, correo, cookies o trazas. No usar el payload como identidad.

Login reutiliza attemptLogin y el mismo control de intentos por correo, sin ampliar los tres propósitos administrativos existentes. El SDK autenticado del usuario lee su perfil activo; el móvil recibe access token, refresh token, vencimiento y perfil. Refresh valida de nuevo el perfil. Las lecturas usan un cliente nuevo por petición con JWT verificado por Auth y RLS, y derivan el alumno de ese usuario; no aceptan alumno desde query. Sesiones ajenas se responden como no encontradas. No añadir funciones definer, claves administrativas en el binario ni caché de respuestas personales.

Logout revoca solo la sesión móvil cuando hay conexión. El cliente retira únicamente sus credenciales locales y no afirma revocación remota si falla la red. Las peticiones móviles no modifican las cookies de la web ni cierran otras sesiones al salir normalmente.

## Cliente

Solo origen HTTPS en producción; HTTP local explícito para desarrollo. Guardar únicamente refresh token en SecureStore, manteniendo access token/perfil en memoria. Renovar antes de usar un token vencido y una sola vez ante 401. Serializar renovación y evitar que una respuesta tardía de una cuenta se aplique después de salir o cambiar de cuenta. Fallo de red al recuperar no elimina credenciales; token rechazado por el servidor sí vuelve a acceso. Fallo de almacenamiento no anuncia sesión persistente.

Router protege pantallas y el servidor sigue siendo la autoridad. Consultar rutina no escribe datos. Estados de carga, error y reintento, teclado, objetivos táctiles de 44 px y texto ampliable. La vista web de desarrollo usa memoria para credenciales, sin persistir tokens en localStorage. Configuración de producción apunta solo al origen aprobado. Los recursos se reutilizan desde el arte existente.

## Verificación

Primero pruebas de contratos, límites, identidad, cabeceras, renovación, almacenamiento y respuestas tardías. Integración solo en Supabase aislado 55321: bloqueo de intentos, alumno propio/ajeno, perfil desactivado, consulta sin escrituras y coach entrenando. Tipos/lint/bundles Android e iOS; pruebas de pantallas según herramientas disponibles. Emulación, exportación JavaScript, APK/IPA firmada y aceptación física se registran como evidencias distintas. No se atribuye una prueba física a Expo web.
