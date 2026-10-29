# Operación y recuperación

Estado: controles manuales disponibles, sin monitor continuo o avisos externos configurados. No hay una promesa de disponibilidad, plazo de respuesta o pérdida máxima de datos aprobada. Responsable y contacto público autorizado: Joaquín Domarchi, joaquindomarchi@gmail.com. T205 no está completa hasta cerrar el circuito operativo de la beta y verificar la primera copia semanal programada.

## Comprobación de la versión

Desde la raíz, con Node compatible y sin cargar archivos de entorno:

```sh
npm run ops:check -- 39dc90df3f9b4d0d8dde6f0d68934c0b
```

El argumento es el BUILD_ID del artefacto promovido, no el commit ni un dominio. El valor del ejemplo corresponde a T221, publicado el 29 de octubre de 2026. Contrastar siempre con la evidencia de publicación vigente en specs/009-product-quality/validation.md y specs/010-private-training/validation.md. Desde T210 el comando hace seis GET al dominio exclusivo, incluyendo catálogo/ficha de ejercicio anónimos. No acepta otro origen, redirecciones o identidad. Cada petición tiene diez segundos y 128 KiB máximos. Informa rutas, estados, duración y códigos cerrados; no publica respuestas, cookies, tokens o excepciones. Salida 0 significa que estos seis controles pasaron; 1 indica un fallo y 2 un argumento inválido.

Ejecutar al verificar una promoción y al investigar un aviso de un participante. No reemplaza entrar y completar el recorrido con una cuenta de QA aislada; no verifica una escritura real ni una conexión directa a la base. No afirma que un pendiente local ya llegó al coach.

| Código             | Interpretación y siguiente paso                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| artifact_mismatch  | Comprobar alias y BUILD_ID en Vercel; no promover otro build para ocultar la diferencia.                           |
| unexpected_status  | Revisar disponibilidad y estado HTTP. Un 200 en una lectura privada anónima bloquea la distribución.               |
| unsafe_cache       | Revisar cabeceras privadas/no-store y separación de autenticación antes de continuar.                              |
| invalid_contract   | Verificar que la API compatible sigue devolviendo JSON v1 y unauthorized.                                          |
| response_too_large | Revisar la ruta/artefacto esperado; no guardar el cuerpo en un log público.                                        |
| transport_error    | Comprobar conexión, certificado, estado del proveedor y acceso al dominio. Puede ser un timeout o una redirección. |

## Incidentes

Conservar plataforma, versión/build, hora con zona, pantalla, acción y código visible. No pedir contraseñas, enlaces de recuperación, cookies o un volcado de SQLite. Antes de compartir una captura, quitar nombres, correo, notas y datos de entrenamiento. El control anterior no envía reportes a terceros.

Para un cierre Android, registrar versión exacta y reproducir primero con el APK quality y datos ficticios. Los logs nativos quedan privados; contrastar PID/paquete para separar un fatal de la app de un fallo del emulador o controlador. iOS se revisa con su propio binario/dispositivo. No atribuir al teléfono un cierre reproducible del producto.

Si falta un entrenamiento, conservar el pendiente y su causa en el dispositivo. No borrar datos, reinstalar ni repetir con otro identificador. Verificar misma cuenta y resultado confirmado antes de reintentar. Si la identidad caducó, recuperar acceso por el recorrido existente; no copiar tokens entre dispositivos. Un rechazo permanente permanece visible para resolverlo sin un bucle de envíos.

Ante una sospecha de acceso ajeno, detener el envío de nuevas versiones, conservar evidencia privada mínima y revisar JWT/RLS con cuentas aisladas. No desactivar RLS para restaurar acceso. Los errores de validación no se corrigen modificando registros de alumnos a mano.

## Proveedores y límites

Vercel permite revisar estado HTTP, despliegue y logs de runtime desde el proyecto iron-strength. Filtrar por ventana/versión antes de leer mensajes. La documentación actual indica una hora de consulta de runtime para Hobby; no equivale a un plazo máximo acreditado de eliminación de toda la telemetría del proveedor, un archivo permanente o una alerta configurada. Los proveedores pueden registrar metadatos de peticiones; evitar enlaces con credenciales y no exportar logs completos al chat. [Runtime logs](https://vercel.com/docs/logs/runtime), consultado el 25 de octubre de 2026.

Supabase recomienda a proyectos gratuitos exportar con CLI y mantener copias fuera del proveedor; no se presume respaldo diario o PITR de pago. El procedimiento y los ensayos están en docs/backup-restore.md. Un dump SQL no contiene los bytes de Storage. [Respaldos oficiales](https://supabase.com/docs/guides/platform/backups), consultado el 25 de octubre de 2026.

GitHub Actions sigue bloqueado por facturación/límite de gasto del propietario, con cero trabajos en 40169728166. No confundir ese estado con tests aprobados o fallidos. Resolver la cuenta antes de confiar en CI; los controles locales conservan evidencia propia. No cambiar planes, límites o pagos como parte de un incidente rutinario.

## Actualización compatible

Registrar commit, BUILD_ID, EAS build, paquete, versión, certificado y API. Android preview code 2 tiene un cierre conocido en confirmación de comentarios; no distribuirlo a nuevos participantes. Code 4 es el último preview histórico construido antes de T210–T221, comprobado en emuladores de 4 y 16 KB; requiere reemplazo actualizado para las funciones nuevas. Ver docs/native-distribution.md antes de recomendar un artefacto. Un APK quality usa otra base/paquete y nunca se distribuye como preview.

Conservar compatibilidad con los formatos anteriores de sesión, descarga, borradores y cola. No reemplazar el snapshot de un entrenamiento iniciado ni retirar un formato desconocido. Publicar primero la API compatible; comprobar el mismo artefacto preparado y promoverlo manualmente. Las versiones móviles instaladas seguirán usando la API: recuperar web no permite retirar endpoints o revertir migraciones a ciegas.

Ante una regresión web, usar la recuperación compatible T221 `dpl_GWe59wi4okfgG1c66NzYx2akn34F` (BUILD_ID `44278ebc9b37434483db6c19c73d0876`, fuentes cbb442c verificadas). Confirmar el proyecto y los permisos, promover ese artefacto sin recompilar, mantener autoAssignCustomDomains=false y repetir ops:check con su BUILD_ID y el recorrido autenticado apropiado. N/ef205b5, M, L y K no representan todos los tipos nuevos; no son una recuperación transparente. Conservar las migraciones y los datos. Evidencia vigente en specs/010-private-training/release.md. Una recuperación móvil exige un build corregido con versión superior y misma firma, no desinstalar para perder pendientes. No hay actualizaciones OTA configuradas ni un mecanismo para retirar binarios ya instalados.

## Respaldo y mantenimiento

Antes de una migración remota, comprobar el Supabase exclusivo udwhjcnlfqlggblnpchu, generar copia nueva privada, verificar hashes y restaurar en un destino aislado. La copia manual posterior a T221 del 29 de octubre conserva 66 tablas/698 filas y las 56 migraciones vigentes. Se restauró ese mismo archivo en una base privada nueva: datos, metadatos, ACL, propietarios y RLS coinciden, con cero migraciones pendientes. El bucket privado estaba vacío, por lo que no se acredita restauración de bytes de fotos. No cubre escrituras posteriores ni acredita una ejecución semanal programada o un destino externo. No usarlo como copia actual sin contrastar cambios. No restaurar sobre la base interactiva o remota durante un ensayo.

Revisar auditorías de dependencias y parches compatibles antes de distribuir. Conservar los avisos de herramientas pendientes, su alcance y evidencia; no aplicar audit fix forzado que cambie el SDK. Volver a probar exportación, permisos y binario después de un cambio nativo. Medir fallos/reintentos confirmados con evidencia, sin agregar analítica de comportamiento o datos personales.

El propietario eligió F.R.I.D.A.Y., 30 días y frecuencia semanal y antes de migraciones el 25 de octubre. Copia cifrada nueva y descifrado/integridad verificados; ubicación, vencimiento y clave separada en docs/backup-restore.md. Seguimientos locales activos: lunes 09:00 respaldo y diariamente 09:30 caducidad, America/Santiago; primera copia semanal programada pendiente. Procedimiento en docs/scheduled-backups.md. Es el mismo equipo/disco, sin copia externa. La programación no prueba ejecución futura o restauración SQL; el equipo/Codex/acceso deben estar disponibles.

La primera revisión programada de caducidad terminó correctamente el 25 de octubre, 09:27:29 Santiago: salida 0, sin vencidos, errores o eliminaciones. No acredita una copia semanal generada; ese primer resultado todavía está pendiente. Detalle en docs/scheduled-backups.md.

Responsable/contacto público confirmados el 25-oct-2026: Joaquín Domarchi, joaquindomarchi@gmail.com. Pendientes: retención de registros técnicos, aceptación física y cuentas de tiendas. Revisar la primera copia semanal programada y el circuito operativo de beta; custodia independiente de clave como mejora respecto del destino local elegido. La copia local privada y este manual no acreditan respaldo externo, guardia de soporte o monitorización continua de la app.

## Ventanas de logs y límites de la comprobación · 25 de octubre de 2026

Supabase describe el tiempo accesible de logs por plan: un día en Free, siete en Pro, veintiocho en Team y noventa en Enterprise. Son ventanas de consulta para el cliente, no evidencia del borrado completo de los registros internos del proveedor. [Referencia oficial de acceso a logs](https://supabase.com/kb/troubleshooting/check-usage-for-monthly-active-users-mau-MwZaBs).

Su documentación de cuotas también describe una posible reducción futura de acceso/retención si se excede la asignación de consultas, pero señala expresamente que esa aplicación aún no está vigente. No interpretar esos escenarios como el estado actual del proyecto. Para diagnosticar un incidente, limitar ventana y tipo de servicio; no crear consultas periódicas amplias como sustituto de un flujo continuo de logs. [Cuotas y estado de aplicación](https://supabase.com/docs/guides/platform/manage-your-usage/logs-query).

La CLI autenticada resolvió el proyecto exclusivo y su organización, pero los listados de proyectos/organizaciones no incluyen el plan ni configuración de conservación. El panel web redirigió al inicio de sesión; no se completó otra autenticación o cambió configuración. Por tanto, el plan efectivo y los ajustes de logs de esta cuenta siguen sin acreditarse en esta revisión. No convertir el requisito de planes gratuitos del repositorio en evidencia de facturación real. La política pública genérica sigue siendo válida como información con límites; no se modificó para inventar una cifra.

La revisión no exportó contenido de logs, creó destinos externos o amplió su conservación. Los respaldos propios mantienen su objetivo de treinta días y sus excepciones; ese plazo no se aplica automáticamente a Vercel/Supabase o a correos de soporte. Antes de los formularios finales de tiendas, verificar el ajuste de la cuenta cuando el panel esté disponible. Evidencia técnica sin secretos en product-log-retention-verification.json, privado fuera de Git.

### Diferencia de acceso entre CLI y navegador

En la comprobación posterior, el acceso habitual mediante GitHub se completó sin introducir una contraseña o conceder permisos nuevos. El panel mostró una organización distinta de la organización del proyecto resuelta por la CLI; la apertura del proyecto exclusivo terminó con «You do not have access to this project». No atribuirle al proyecto el plan Free que aparece en esa otra organización. Esto demuestra una diferencia de acceso entre sesiones, no quién es el propietario correcto ni que la app use otra base.

Se solicitó al propietario aclarar si usa otra cuenta de Supabase para Iron Strength. Hasta resolverlo, mantener plan/ajustes efectivos como no verificados; no trasladar proyectos, otorgar permisos, crear otra organización, modificar autenticación de la app o cambiar el destino de la CLI para hacer coincidir las sesiones. No guardar URLs transitorias de autorización, tokens o credenciales como evidencia; solo el proyecto, organización esperada y resultado de acceso.

El propietario decidió «Revisarlo más adelante» el 25-oct-2026. La aclaración de cuenta y la comprobación del panel quedan aplazadas: no volver a pedir acceso ni intentar otra autenticación hasta que retome este punto. No hay una pregunta pendiente de respuesta; se conserva la incertidumbre sobre plan/ajustes y la configuración existente del backend.

### Acceso resuelto mediante el conector de Codex

El 25-oct-2026 el propietario conectó Supabase y pidió comprobarlo. get_project respondió para udwhjcnlfqlggblnpchu (iron-strength), ACTIVE_HEALTHY y la organización dmxfsaficekokkbjsbqq, coincidente con la CLI. get_organization confirmó plan free/tier_free; list_migrations devolvió las mismas 40 versiones del repositorio, incluida 20261024120000. Esto sustituye la incertidumbre anterior sobre el plan y permite operar por el conector autorizado sin resolver antes la sesión del navegador. No verifica ni modifica el acceso del navegador.

Para ese plan la documentación oficial describe un día de logs consultables; no es prueba de eliminación de todos los registros internos ni se convierte en una promesa pública de borrado. No se consultó contenido de logs ni se alteraron ajustes, datos, permisos, claves, plan o facturación. Evidencia mínima privada en product-supabase-connector-proof.json, sin nombres de cuentas, credenciales o datos de alumnos. Queda cerrada la comprobación de acceso y plan por esta vía; no hace falta pedir otra autenticación para repetirla.

### Comprobación gratuita de GitHub · 25 de octubre de 2026

La cuenta muestra GitHub Free, 1436 de 2000 minutos Actions usados (564 disponibles), almacenamiento 0 de 0,5 GB y consumo facturable Actions 0 USD. Budgets and alerts muestra un presupuesto Actions ya existente de 10 USD, con 0 USD consumidos; esta revisión no lo creó ni modificó. El intento 40249825936, fuente 3e53cf7, terminó startup_failure y no creó trabajos; su anotación mantiene el aviso genérico sobre pagos recientes o límite de gasto. No es evidencia de cuota gratuita agotada, pago concreto rechazado o necesidad de contratar otro plan.

El siguiente paso es aclarar la restricción con la cuenta/soporte de GitHub, aportando ese intento y la cuota visible, sin enviar datos de tarjetas, tokens o registros privados. No ampliar presupuesto o habilitar gasto para diagnosticarlo. No se repitió el workflow: el último intento del commit actual ya acredita el bloqueo. Las pruebas locales conservan su evidencia y no se presentan como CI aprobado.
