# Revisión de seguridad — T102

Fecha: 2026-10-07 · Alcance: todo el repositorio en `main` al cierre de M8.

## Resultado

Sin hallazgos altos abiertos. Dos mejoras aplicadas durante la revisión.

## Comprobaciones

| Área               | Qué se verificó                                                                                                                                                                                                                                                                                | Resultado |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Clave de servicio  | `createAdminClient` se usa solo en 3 puntos del plan: login (control de intentos), registro por invitación y, en acciones del coach, comprobación de correo y enlace de restablecimiento. `admin.ts` es `server-only`: importarlo desde un Client Component rompe el build (verificado en T6). | OK        |
| Secretos           | Único archivo de entorno versionado: `.env.example`, con valores de la pila local y credenciales de prueba marcadas como no productivas. `.env*` está en `.gitignore`. No hay claves reales en el historial.                                                                                   | OK        |
| Autorización       | Toda server action autenticada llama a `requireUser` o `requireCoach`. Las 4 sin guarda son públicas por diseño (login, cierre de sesión, registro por invitación, restablecimiento con token). La barrera real es la RLS, probada con pgTAP (12 archivos) y con tests de integración.         | OK        |
| RLS                | Todas las tablas tienen RLS. Un alumno no ve datos de otro (pgTAP + E2E). Un usuario desactivado pierde acceso al instante, también con la sesión abierta.                                                                                                                                     | OK        |
| Storage            | Bucket privado, 1 MB, solo JPEG/WebP, carpeta por dueño, enlaces firmados de 5 minutos; la URL pública no entrega archivos (E2E).                                                                                                                                                              | OK        |
| Autenticación      | Registro público cerrado; invitaciones atadas a un correo, de un solo uso, token solo como hash; 5 intentos por correo y 15 minutos de bloqueo; errores genéricos.                                                                                                                             | OK        |
| Entrada de usuario | Validación con zod en servidor para toda mutación; el cliente nunca decide `student_id`, rol ni semana.                                                                                                                                                                                        | OK        |
| Dependencias       | `npm audit --omit=dev`: **0 vulnerabilidades** tras mover la CLI `shadcn` (solo build) a `devDependencies`.                                                                                                                                                                                    | Corregido |
| Cabeceras HTTP     | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y una CSP de `frame-ancestors`, `base-uri`, `form-action` y `object-src`. Verificado por E2E.                                                                                                             | Añadido   |

## Riesgos aceptados

- **Sin CSP de scripts**: Next inyecta scripts en línea y exigiría nonces. Se mitiga con validación estricta de entrada, ausencia de HTML inyectado (el único `dangerouslySetInnerHTML` es el script estático del tema) y cabeceras anteriores.
- **Correo de recuperación**: no existe (DC-3). El restablecimiento lo entrega el coach en persona o por su canal; el enlace vence en 24 h y es de un solo uso.
- **Supabase Free**: sin copias de seguridad automáticas ni SLA. Para tres usuarios es aceptable; conviene exportar la base de vez en cuando.

## Para producción (acciones del usuario)

1. En el panel de Supabase: desactivar "Allow new users to sign up" y mantener el proveedor Email activo (ver nota en `supabase/config.toml`).
2. Fijar `otp_expiry` en 86400 (24 h) en Authentication → Providers → Email.
3. Cargar las variables en Vercel como secretas; `SUPABASE_SECRET_KEY` jamás con prefijo `NEXT_PUBLIC_`.

## Adenda — Fase 2 (spec 003, T130)

Fecha: 2026-10-08 · Alcance: tablas `achievements` y `comment_reads`, funciones `unread_comments`, `mark_comments_read` y `delete_my_account`, la ruta `/export/history` y la pantalla "Mi cuenta".

| Área                       | Qué se verificó                                                                                                                                                                                                                                                                                  | Resultado |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| Clave de servicio          | Sigue usándose solo en los mismos puntos (login, registro por invitación y acciones del coach). Borrar la cuenta **no** la usa: lo hace la función `delete_my_account` y los archivos de fotos los borra el propio alumno con su sesión.                                                         | OK        |
| `delete_my_account`        | `security definer` con `search_path` vacío; exige sesión y que quien llama sea un alumno activo; solo borra al propio usuario (`auth.uid()`); sin permisos para `anon`. pgTAP 15: sin sesión, coach y alumno desactivado reciben 42501; la cascada borra todo lo del alumno y nada de los demás. | OK        |
| Fotos al borrar            | Si el borrado de archivos falla, no se borra la cuenta (se puede reintentar). También se borran archivos sin fila registrada de su carpeta. Probado en integración.                                                                                                                              | OK        |
| `unread_comments` y marcas | Funciones `security invoker`: la RLS de `comments` y `workouts` sigue siendo la única barrera. `comment_reads` solo se ve y escribe con el propio `user_id`, y solo sobre entrenamientos visibles. pgTAP 14.                                                                                     | OK        |
| Exportar CSV               | Ruta con sesión obligatoria; el id se valida como UUID; la RLS decide y un alumno ajeno recibe 404 sin saber que existe (E2E). Cabeceras `no-store` y `nosniff`. Nombres de ejercicio neutralizados contra inyección de fórmulas (RF-67).                                                        | OK        |
| Borrado con confirmación   | La acción del servidor exige rol alumno y la palabra BORRAR; no depende de lo que valide el cliente.                                                                                                                                                                                             | OK        |
| Dependencias               | `npm audit --omit=dev`: 0 vulnerabilidades. No se agregó ninguna dependencia.                                                                                                                                                                                                                    | OK        |

**Riesgo aceptado (DC-28):** `achievements` deja insertar al propio alumno, así que quien llame a la API a mano podría otorgarse un logro del catálogo. Es un dato cosmético sin efecto sobre nada más; sí está impedido que otorgue a otros, que los modifique o los borre (pgTAP 13).

**Contraste:** la variante destructiva del botón se oscureció en modo claro para cumplir AA (hallazgo de axe en las pruebas de accesibilidad).
