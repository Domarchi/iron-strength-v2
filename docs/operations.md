# Operación y recuperación

Estado: controles manuales disponibles, sin monitor continuo o avisos externos configurados. No hay una promesa de disponibilidad, plazo de respuesta o pérdida máxima de datos aprobada. T205 no está completa hasta cerrar los responsables y el circuito operativo de la beta.

## Comprobación de la versión

Desde la raíz, con Node compatible y sin cargar archivos de entorno:

```sh
npm run ops:check -- 0465f35e9b004c0393da6d391e7ed433
```

El argumento es el BUILD_ID del artefacto promovido, no el commit ni un dominio. El valor del ejemplo corresponde a L, publicado el 25 de octubre de 2026. Contrastar siempre con la evidencia de publicación vigente en specs/009-product-quality/validation.md. El comando solo hace cuatro GET al dominio exclusivo; no acepta otro origen, redirecciones o identidad. Cada petición tiene diez segundos y 128 KiB máximos. Informa rutas, estados, duración y códigos cerrados; no publica respuestas, cookies, tokens o excepciones. Salida 0 significa que estos cuatro controles pasaron; 1 indica un fallo y 2 un argumento inválido.

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

Vercel permite revisar estado HTTP, despliegue y logs de runtime desde el proyecto iron-strength. Filtrar por ventana/versión antes de leer mensajes. La documentación actual indica una hora de retención para Hobby; no equivale a un archivo permanente ni a una alerta configurada. Los proveedores pueden registrar metadatos de peticiones; evitar enlaces con credenciales y no exportar logs completos al chat. [Runtime logs](https://vercel.com/docs/logs/runtime), consultado el 25 de octubre de 2026.

Supabase recomienda a proyectos gratuitos exportar con CLI y mantener copias fuera del proveedor; no se presume respaldo diario o PITR de pago. El procedimiento y los ensayos están en docs/backup-restore.md. Un dump SQL no contiene los bytes de Storage. [Respaldos oficiales](https://supabase.com/docs/guides/platform/backups), consultado el 25 de octubre de 2026.

GitHub Actions sigue bloqueado por facturación/límite de gasto del propietario, con cero trabajos en 40169728166. No confundir ese estado con tests aprobados o fallidos. Resolver la cuenta antes de confiar en CI; los controles locales conservan evidencia propia. No cambiar planes, límites o pagos como parte de un incidente rutinario.

## Actualización compatible

Registrar commit, BUILD_ID, EAS build, paquete, versión, certificado y API. Android preview code 2 tiene un cierre conocido en confirmación de comentarios; no distribuirlo a nuevos participantes. Verificar el reemplazo antes de recomendarlo. Un APK quality usa otra base/paquete y nunca se distribuye como preview.

Conservar compatibilidad con los formatos anteriores de sesión, descarga, borradores y cola. No reemplazar el snapshot de un entrenamiento iniciado ni retirar un formato desconocido. Publicar primero la API compatible; comprobar el mismo artefacto preparado y promoverlo manualmente. Las versiones móviles instaladas seguirán usando la API: recuperar web no permite retirar endpoints o revertir migraciones a ciegas.

Ante una regresión web, L puede recuperar K según la evidencia vigente, conservando la base y las migraciones aditivas. Verificar identificador, permisos y compatibilidad antes de promover; repetir ops:check con el BUILD_ID de K y el recorrido autenticado apropiado. Una recuperación móvil exige un build corregido con versión superior y misma firma, no desinstalar para perder pendientes. No hay actualizaciones OTA configuradas ni un mecanismo para retirar binarios ya instalados.

## Respaldo y mantenimiento

Antes de una migración remota, comprobar el Supabase exclusivo udwhjcnlfqlggblnpchu, generar copia nueva privada, verificar hashes y restaurar en un destino aislado. El ensayo actualizado T205 del 25 de octubre conserva 49 tablas/524 filas, 55 políticas y 28 propietarios/banderas, con las 40 migraciones actuales. Datos y permisos coinciden en una base nueva aislada; el bucket privado estaba vacío, por lo que no se acredita restauración de bytes de fotos. No cubre escrituras posteriores ni un destino externo cifrado/programado. No usarlo como copia actual sin contrastar cambios. No restaurar sobre la base interactiva o remota durante un ensayo.

Revisar auditorías de dependencias y parches compatibles antes de distribuir. Conservar los avisos de herramientas pendientes, su alcance y evidencia; no aplicar audit fix forzado que cambie el SDK. Volver a probar exportación, permisos y binario después de un cambio nativo. Medir fallos/reintentos confirmados con evidencia, sin agregar analítica de comportamiento o datos personales.

Pendiente con el propietario: responsable operativo/contacto público, frecuencia y destino cifrado de respaldos, retención/eliminación de copias y registros, aceptación física y cuentas de tiendas. La copia local privada y este manual no acreditan un respaldo externo programado, una guardia de soporte o avisos continuos. No se activó ninguno sin una decisión concreta.
