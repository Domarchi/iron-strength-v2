# Respaldos programados en F.R.I.D.A.Y.

Decisión del propietario: semanalmente y antes de migraciones; conservar 30 días. El destino es local, en el mismo disco que las claves. No es una copia externa. La programación se realiza mediante seguimientos de este chat en Codex, no mediante GitHub Actions, cron o un servicio contratado.

## Respaldo semanal · lunes 09:00 America/Santiago

Este seguimiento ejecuta el respaldo. No se limita a pedir que lo haga el propietario. Leer AGENTS.md y docs/backup-restore.md, verificar host F.R.I.D.A.Y., carpeta de proyecto y referencia vinculada exacta udwhjcnlfqlggblnpchu. Si cambió la referencia, faltan credenciales o no se dispone del equipo, informar el impedimento sin cambiar claves, pagos o proyecto.

Crear staging privado nuevo fuera de Git, con identificador único y permisos 0700/0600. Consultar inventario actual, migraciones, RLS y bucket privado; obtener huellas de las filas y permisos de todas las tablas de public/auth/storage/migraciones. Las plantillas privadas de los ensayos anteriores pueden orientar, pero contrastar la lista con el esquema actual para no omitir tablas nuevas. Guardar resultados únicamente en ese staging, no en la salida del chat.

Exportar los seis SQL del procedimiento de backup-restore.md con la CLI autenticada. Las operaciones remotas son de lectura. No ejecutar reset, semillas, migraciones, escrituras SQL o subida de objetos. No usar debug ni imprimir conexiones, tokens o filas. Crear manifest.json con nombres, tamaños y SHA-256 de roles.sql, schema.sql, managed-schema.sql, data.sql, history-schema.sql e history-data.sql.

Consultar Storage y descargar todos los objetos existentes del bucket progress-photos a photos, conservando las rutas. Comparar inventario completo, tamaños y hashes de los bytes; repetir la comprobación al final. Un listado vacío de la CLI puede ser texto, no JSON: solo considerarlo vacío si el inventario SQL también confirma cero objetos y la llamada terminó correctamente. Si el bucket está vacío no afirmar que se probaron bytes de fotos. Guardar storage-verification.json con bucket, remoteObjects y verified=true únicamente tras estas comprobaciones.

Repetir huellas de filas/permisos e inventario tras exportar. Si hay cambios, descartar el intento incompleto y reintentar en staging nuevo un máximo de dos veces; si continúa cambiando, pedir ventana de mantenimiento. No declarar consistente una mezcla de copias. Los archivos de entrada del empaquetador son manifest.json, remote-hashes.json, remote-hashes-after.json, remote-policies.json, audit.json y storage-verification.json, además de los seis SQL y photos si corresponde. Los dos archivos de huellas contienen rows[0].jsonb_agg y deben coincidir. Las plantillas locales están en work/product-t205-release/backup, fuera del repo; si faltan, reconstruir únicamente consultas de lectura a partir del esquema verificado.

Ejecutar desde la raíz `python3 scripts/package-backup.py CARPETA_PRIVADA`. Python, GnuPG y CLI deben estar disponibles. El empaquetador comprueba hashes SQL, estabilidad y cantidad de fotos, cifra con secreto aleatorio por copia, verifica descifrado idéntico, clave incorrecta y corrupción; escribe copia/manifiesto en /home/friday/Backups/Iron-Strength y clave en /home/friday/.local/share/iron-strength-backup/keys. La clave no va en argumentos, chat o logs. El manifiesto privado contiene vencimiento a 30 días y las comprobaciones realizadas. Una excepción conserva archivos para investigar y nunca acredita éxito.

Después de verificar el archivo final y su manifiesto, retirar solo el staging temporal creado por esta ejecución, evitando dejar otra copia SQL/fotos sin cifrar. Conservar un resumen técnico privado sin datos personales y las referencias de la copia. No borrar carpetas históricas del workspace. Informar fecha, resultado y causa cerrada si falló. Una verificación de cifrado no equivale a restaurar el SQL: anotar esa diferencia y seguir el ensayo aislado antes de migrar.

## Caducidad · diariamente 09:30 America/Santiago

Ejecutar `npm run ops:backup:prune -- --apply`. Sin --apply solo muestra vista previa. El comando tiene host/directorios cerrados; valida manifiestos v1, fechas, hash, tamaño, rutas derivadas, permisos y propietario. Nunca usa una ruta arbitraria del manifiesto para borrar. Retira solo el cifrado, la clave y el manifiesto propios que hayan vencido. Conserva archivos ajenos, enlaces, formatos desconocidos o conjuntos inválidos y devuelve errores sin secretos.

Si todas las copias válidas vencieron, no elimina la última disponible y devuelve no_current_backup: requiere generar una copia nueva y atención del responsable. Un borrado parcial devuelve delete_failed; no afirmar que se retiró el conjunto completo ni ampliar la limpieza a otros archivos. Esta excepción y las interrupciones del equipo impiden prometer un plazo máximo de borrado ya cumplido. Los respaldos manuales anteriores fuera de este destino requieren inventario y retirada separada.

## Antes de migraciones y límites

Primera ejecución recibida del seguimiento caducidad-de-respaldos-de-iron-strength: **25 de octubre de 2026, 09:27:29 America/Santiago**. El comando configurado terminó con salida 0, ok=true y listas eligible/deleted/errors vacías; skipped=0. No se eliminó ningún archivo. Esta evidencia corresponde a la revisión de caducidad, no al respaldo semanal: la primera copia generada por su seguimiento sigue pendiente. Se conserva la hora real observada, sin ajustarla artificialmente al horario solicitado de 09:30.

Antes de cada migración remota, generar una copia nueva con este procedimiento y restaurarla en una base aislada nueva; contrastar datos y permisos antes de permitir la migración. Una copia semanal reciente no reemplaza ese paso. No aplicar SQL remoto automáticamente desde los seguimientos. El protocolo se exige al operador; no es un hook que intercepte cualquier comando de terminal.

Revisar los primeros resultados del seguimiento y registrar la primera ejecución programada efectiva. El equipo encendido, Codex abierto, acceso de red, CLI autenticada y herramientas locales son requisitos. La creación de un horario no prueba una ejecución futura ni una restauración automática. [Documentación oficial de tareas programadas](https://learn.chatgpt.com/docs/automations?surface=app), consultada el 25 de octubre de 2026.
