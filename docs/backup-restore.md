# Respaldo y restauración

Último ensayo T195, 24 de octubre de 2026: seis volcados del proyecto exclusivo, 39 versiones antes del cambio, restaurados en iron_restore_t195_20261024 del runtime aislado. Coinciden 49 tablas/523 filas, 53 políticas y 27 propietarios/banderas. Se alineó solo el permiso CREATE de postgres en el esquema público de esa copia (su dueño de base difiere del remoto), sin modificar roles globales o producción. La migración 20261024120000 se ensayó allí con rol postgres, manteniendo filas y políticas anteriores. Después se aplicó en remoto: 40 versiones, recibos vacíos y RLS/grants/invoker verificados; solo cambió el historial de migraciones entre las tablas previas. Detalles en specs/009-product-quality/validation.md y evidencia privada work/product-t195-release/backup. El respaldo previo a esa migración no contiene recibos creados posteriormente; actualizarlo antes de una recuperación real.

Un respaldo solo está comprobado después de restaurarlo en un destino aislado y verificar datos y permisos. Nunca ensayar sobre la base interactiva ni sobre producción. No guardar respaldos, claves, tokens o fotos privadas en Git, CI artifacts o el chat.

## Antes de una migración remota

Verificar la referencia `udwhjcnlfqlggblnpchu`, identidad del proyecto y esquema de Iron Strength. Anotar commit, listado de migraciones, fecha y recuentos por tabla. Elegir una ventana sin escrituras para que base y archivos correspondan al mismo estado. Guardar en una carpeta privada, con permisos 0700/0600 y cifrado en el almacenamiento de respaldo.

Tras vincular el proyecto correcto y autenticar la CLI, usar una carpeta nueva fuera del repositorio:

```sh
umask 077
mkdir -p ../backups/iron-strength-release
npx supabase db dump --linked --role-only -f ../backups/iron-strength-release/roles.sql
npx supabase db dump --linked -f ../backups/iron-strength-release/schema.sql
npx supabase db dump --linked --schema auth,storage,extensions -f ../backups/iron-strength-release/managed-schema.sql
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

## Ensayo del respaldo remoto T181

El 21 de octubre de 2026 se respaldó exclusivamente `udwhjcnlfqlggblnpchu`, con 36 migraciones, en una carpeta privada nueva fuera de Git. Los seis volcados incluyen roles, esquema público, esquemas administrados, datos e historial. Se comprobaron sus hashes y permisos de archivos. El bucket privado no contenía objetos; no había fotos cuyos bytes copiar. Los datos reales de este respaldo nunca se usaron para sembrar cuentas de prueba ni se subieron a otro proyecto remoto.

El respaldo se restauró en una base nueva `iron_restore_t181` del clúster aislado local, puerto 55322, sin cambiar la base interactiva ni el destino de la API de pruebas. Se prepararon los prerrequisitos locales `vault` y la publicación `supabase_realtime`. Los objetos de esquemas administrados que dependían de tablas públicas se aplicaron después de ellas. Cada fase detuvo la ejecución ante errores. No se aplicaron definiciones globales de roles sobre el clúster que ejecutaba las pruebas.

Coinciden los hashes de **49 tablas y 513 filas**, las **51 políticas** y los propietarios y banderas de seguridad de **26 tablas públicas/Storage**. La comparación de expresiones de políticas usa el mismo `search_path` vacío para evitar diferencias de representación. La cuenta Auth existente y su hash se conservaron; no se inició sesión como el propietario, no se cambió su contraseña y no se envió correo. El ensayo comprueba la restauración de datos y permisos; el acceso real y las fotos en un teléfono siguen en su protocolo separado.

Sobre esa copia restaurada se ensayaron, en orden, `20261021120000_atomic_routine_additions`, `20261021120001_reviewed_planning` y `20261021120002_prescription_series`. Las huellas de las **18 tablas públicas preexistentes** permanecen iguales al omitir únicamente las nuevas columnas nullable cuando son nulas. La copia de los datos remotos permanece aislada; este ensayo no aplica las migraciones a producción.

Evidencia privada: `work/t181-remote-backup-native/manifest.json`, `restore-verification.json` y `migration-rehearsal.json`, en el directorio padre. Antes de aplicar en remoto, volver a verificar identidad, historial y cambios de datos posteriores al respaldo; si los hay, crear otro respaldo y verificarlo. No usar un respaldo anterior como si cubriera escrituras nuevas.

## Actualización y aplicación T181 — 23 de octubre de 2026

La comprobación previa encontró cambios de sesiones/tokens/usuario Auth respecto del día 21, por lo que se generó un respaldo nuevo de seis volcados. Sus hashes de las 49 tablas permanecieron estables durante la copia y se volvieron a comprobar justo antes de aplicar. El bucket seguía sin objetos y privado.

Se restauró en una nueva base aislada `iron_restore_t181_20261023`: **49 tablas/514 filas, 51 políticas y 26 propietarios/banderas de tablas coincidentes**. El ensayo de las tres migraciones mantuvo las huellas de las 18 tablas públicas preexistentes. Se aplicaron después únicamente esas tres por la CLI al Supabase exclusivo udwhjcnlfqlggblnpchu: 39 versiones coincidentes, datos conservados, RLS activa y fotos privadas. No se ejecutaron reset ni semillas remotas, ni se inició sesión como el propietario.

Los archivos nuevos están en `work/t181-release-20261023/backup/` y la auditoría de aplicación en `work/t181-release-20261023/database-verification.json`, privados fuera de Git. No sustituirlos por el respaldo anterior al recuperar actividad de Auth posterior al día 21. El despliegue A de la entrega permite recuperar el frontend conservando estas migraciones aditivas.
