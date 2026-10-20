# Respaldo y restauración

Un respaldo solo está comprobado después de restaurarlo en un destino aislado y verificar datos y permisos. Nunca ensayar sobre la base interactiva ni sobre producción. No guardar respaldos, claves, tokens o fotos privadas en Git, CI artifacts o el chat.

## Antes de una migración remota

Verificar la referencia `udwhjcnlfqlggblnpchu`, identidad del proyecto y esquema de Iron Strength. Anotar commit, listado de migraciones, fecha y recuentos por tabla. Elegir una ventana sin escrituras para que base y archivos correspondan al mismo estado. Guardar en una carpeta privada, con permisos 0700/0600 y cifrado en el almacenamiento de respaldo.

Tras vincular el proyecto correcto y autenticar la CLI, usar una carpeta nueva fuera del repositorio:

```sh
umask 077
mkdir -p ../backups/iron-strength-release
npx supabase db dump --linked --role-only -f ../backups/iron-strength-release/roles.sql
npx supabase db dump --linked -f ../backups/iron-strength-release/schema.sql
npx supabase db dump --linked --data-only --use-copy -x storage.buckets_vectors,storage.vector_indexes -f ../backups/iron-strength-release/data.sql
npx supabase db dump --linked --schema supabase_migrations -f ../backups/iron-strength-release/history-schema.sql
npx supabase db dump --linked --schema supabase_migrations --data-only --use-copy -f ../backups/iron-strength-release/history-data.sql
npx supabase storage cp --project-ref udwhjcnlfqlggblnpchu --linked -r ss:///progress-photos ../backups/iron-strength-release/photos
```

No reutilizar una carpeta de otro respaldo: evitar mezclar archivos borrados con los vigentes. Revisar los archivos generados y sus sumas SHA-256 sin publicar su contenido. La configuración de Auth, secretos, URLs y el código de las migraciones se conservan por separado y con el acceso adecuado. Un volcado SQL contiene metadatos de Storage, **no los bytes de las fotos**. La CLI no incluye automáticamente todas las modificaciones de los esquemas administrados; las políticas de Storage propias están versionadas en las migraciones.

## Restaurar y comprobar

Crear un proyecto o base temporal que no reciba tráfico de usuarios. No cambiar DNS ni variables de la app para ensayar. Seguir el procedimiento oficial para la versión de Supabase del destino: roles, esquema, datos e historial de migraciones, con parada ante el primer error y transacción cuando corresponda. Usar configuración privada de conexión, sin contraseñas en argumentos o logs. Si se usa Vault, resolver también la clave de cifrado según la guía oficial antes de afirmar que sus secretos son recuperables.

Restaurar las fotos mediante Storage API/S3 con sus rutas originales y bucket privado, revisando colisiones de metadatos según el procedimiento del proveedor. No basta con insertar filas de `storage.objects`. Comparar listado, tamaño y hash de los archivos. Restaurar políticas/grants propios que no haya incluido el volcado, a partir del esquema versionado y sin repetir migraciones ciegamente.

Comprobar:

1. Mismas filas e identidades de perfiles, programas, prescripciones, alternativas, sesiones, series, comentarios, valoración, fotos y recibos. Mismo historial de migraciones.
2. RLS activa y mismas políticas/grants/propietarios de funciones. Con una sesión de alumno, cero entrenamientos o fotos ajenos; con coach, solo alumnos propios y datos propios.
3. Entrada con usuario existente, recuperación de acceso, vista semanal, guardado atómico y reintento idempotente. Verificar una foto privada con URL firmada y rechazo anónimo.
4. Conservación de borradores/cola en el navegador: un registro pendiente se sincroniza una sola vez después de recuperar el servidor.

Registrar el resultado, los ajustes necesarios y cuánto tardó. Una restauración real requiere una ventana de mantenimiento y un destino verificado; conservar el respaldo y el despliegue anterior hasta concluir la aceptación.

## Ensayo local T165

Se usó únicamente la pila aislada de pruebas (puerto 55322). Un `pg_dump` completo en formato custom de PostgreSQL 17.11 se restauró en una base nueva `iron_restore_t165`, conservando propietarios y permisos. El primer intento con el rol limitado `postgres` fue rechazado al restaurar objetos administrados; se repitió con el administrador del runtime **local**. Esto no supone que la misma cuenta exista o esté disponible en Supabase alojado.

Se compararon **57 tablas** de public/auth/storage/migraciones mediante hashes de todas sus filas, además de políticas y banderas RLS. Coinciden. Una consulta como alumno autenticado en la base restaurada devolvió cero entrenamientos ajenos. Los archivos y logs del ensayo quedan en la carpeta privada `work/t165-backup`, fuera de Git. Además, un objeto sintético de Storage se descargó a un archivo privado, se eliminó únicamente ese objeto de prueba y se volvió a subir a su misma ruta. Los hashes coinciden y la descarga anónima fue rechazada; el objeto del ensayo se limpió al terminar. Este ensayo no equivale a un respaldo ni restauración del proyecto remoto, cuyo acceso está pendiente.

Referencias: [respaldo/restauración con CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [alcance de las copias de base de datos](https://supabase.com/docs/guides/platform/backups), [descarga de objetos](https://supabase.com/docs/guides/storage/management/download-objects).
