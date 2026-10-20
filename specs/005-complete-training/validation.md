# Validación — Spec 005

Base previa: T141, 381 unitarias, 207 integración, 296 SQL y 40 E2E. No se atribuyen estos resultados a funciones nuevas.

## T142

Especificación y secuencia del plan aprobado registradas. Check completo en verde: formato, lint, tipos, 381 pruebas unitarias y build. Solo documentación; sin cambios de esquema ni pantallas.

## T143

- Revisión monotónica de sesión, también ante escrituras anteriores; RPC `mutate_routine_session` invoker, bloqueos programa/sesión, recibos con RLS y cascada. Lote y orden atómicos, conflicto explícito, identidad estable al reintentar.
- Trigger de revisión del padre con privilegios limitados por su operación: solo incrementa la revisión del padre de la fila autorizada. Necesita `security definer` para permitir cascadas de Auth; no expone una función de escritura invocable por clientes. La RPC conserva `security invoker`.
- Regresiones primero: cuatro pruebas de integración fallaron sin la implementación. Después: 212 integración y 309 SQL en verde; 382 unitarias, lint, tipos, formato y build en verde.
- Primera suite E2E: 41/42. La prueba de flechas leía la base antes del final del guardado optimista; ahora espera «Orden guardado». Los dos escenarios nuevos (conflicto entre pestañas y pérdida de respuesta después de guardar) pasaron. Reejecución completa final: 42/42 E2E en verde, sin reintentos. Check final vuelve a pasar.
- Migración aplicada al desarrollo sin reset; comparación antes/después confirma los mismos tres perfiles, dos programas y ocho entrenamientos con sus prescripciones y series. Solo se agregó revisión.

## T144

- Borradores versionados del coach por cuenta/programa/sesión/editor, referencia por pestaña y selector de otros borradores. Conservan texto incompleto, revisión base y peticiones inciertas de lote/orden/copia. Limpieza condicionada al contenido del origen para no borrar una edición posterior.
- Comparación explícita de prescripciones local/actual y aplicación sobre la revisión revisada. No se sobrescriben conflictos automáticamente; se muestran ejercicios eliminados y se conservan hasta descarte.
- Estados de persistencia real, fallo de cuota y reintento. Hidratación previa a leer almacenamiento para no mezclar render servidor y datos locales. Guardas de navegación mantenidas; componentes de semanas conservan sus ediciones.
- Pruebas de recuperación y cuota fallaron antes de conectar la UI. Check final en verde: 389 pruebas, formato, lint, tipos y build. Primera suite: 44/44 E2E. Se añadió después el cierre completo de pestaña/limpieza del origen; validación final completa: 45/45 E2E en verde, sin reintentos.
- Sin migraciones ni cambios de permisos. Se reutiliza la revisión y la RPC de T143.
