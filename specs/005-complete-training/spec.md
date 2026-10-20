# Spec 005 — Entrenamiento completo para un coach y tres alumnos

Plan aprobado el 2026-10-20. Amplía las specs 001–004. Las siguientes funciones son requisitos pendientes hasta que tasks.md y validation.md acrediten su implementación.

## Alcance

Un coach (también entrena) y tres alumnos, acceso desde teléfonos por Internet, instalación PWA, rutinas descargadas, alternativas autorizadas y seguimiento. Stack actual, kg, español de Chile, America/Santiago. Se conserva el estilo azul/neutro inspirado en Hevy, temas claro/oscuro, controles de 44 px y contraste AA. No incluye nutrición, pagos, redes sociales, IA ni múltiples coaches.

## Editor fiable

- Guardar prescripciones y reordenar son transacciones completas. Validar pertenencia, permisos, rango y revisión de sesión en la base; ningún fallo deja actualizaciones parciales.
- Cada modificación incrementa la revisión de sesión. Un cliente con una revisión antigua recibe conflicto sin sobrescribir. Reintentos conservan identidad y contenido; una respuesta perdida puede confirmarse sin repetir la escritura.
- Persistir los campos pendientes del coach por cuenta/programa/sesión y revisión base. Recuperar al recargar/cerrar. Informar almacenamiento real, cuota y conflictos. Conservar cambios locales hasta guardar o descartar explícitamente. Cambios estructurales permanecen bloqueados mientras haya prescripciones pendientes.
- Los borradores se separan por cuenta y por editor. Una referencia por pestaña recupera su propio borrador; al abrir de nuevo se ofrece el más reciente y acceso explícito a los demás. No sobrescribir otros borradores. Limpiar el origen recuperado únicamente si no cambió desde su recuperación y se guardó o descartó explícitamente. Conservar peticiones inciertas de guardado, orden y copia para confirmar con el mismo ID tras recargar. La comparación de conflicto muestra prescripción local y actual; aplicar sobre la revisión revisada requiere acción explícita y luego Guardar. Los ejercicios eliminados se muestran y deben descartarse explícitamente antes de aplicar.
- RF-17 se conserva: plantillas editables completas; programas asignados activos solo semanas estrictamente posteriores a la actual; semanas recortadas y programas terminados bloqueados.

## Superseries y descanso

- Grupos de 2–4 ejercicios consecutivos, sin anidación ni pertenencia múltiple. Agrupar/separar y ordenar integrantes; arrastrar grupo mueve bloque; sacar integrante requiere acción explícita. Si queda uno, disolver grupo.
- Tras cada serie de trabajo avanzar al siguiente integrante pendiente de la ronda. Descansar al acabar ronda; cantidades distintas de series continúan con los pendientes. Calentamientos no avanzan la ronda.
- Descanso opcional prescrito por ejercicio/grupo: 0 o 15–600 s. Sin prescripción conservar 90 s trabajo/60 s calentamiento. Ajuste del alumno solo afecta su entrenamiento y próximos descansos.
- Copiar sesión/semana/asignar conserva grupos y descansos con nuevas identidades. Duplicar ejercicio individual lo deja fuera del grupo.

## Contexto y alternativas

- Panel dentro del registro: diez entrenamientos recientes por ejercicio, series y paginación. No desmontar registro ni descanso. Separar prescripción, última ejecución y sugerencia explicada. Copiar valores es explícito y no cambia series hechas.
- Hasta tres alternativas por ejercicio, catálogo activo, sin duplicados ni autorreferencia, cada una con series/rango/peso opcional. Se copian con la rutina.
- El alumno puede elegir alternativa autorizada solo antes de completar series del ejercicio. Mantener posición/grupo. Registrar prescrito y realizado; historial/récords corresponden al realizado. Validar autorización también en SQL. Amplía RF-26; no permite agregar ejercicios arbitrarios.

## Planificación

- Buscar plantillas, duplicar programas completos sin registros, títulos de sesión conservando A–G; vistas previas con conteos.
- Edición múltiple de series/rango/descanso con selección y vista previa, atómica, sin modificar otros campos.
- Día orientativo opcional por sesión. Alumno puede mover dentro de la misma semana, sin cambiar rutina ni bloquear inicio ni alterar cumplimiento.

## Seguimiento

- Esfuerzo percibido opcional entero 1–10 y nota opcional hasta 500 caracteres al terminar. Resumen con ejecución, sustituciones y récords.
- Panel del coach: filtros por alumno; no leídos, sin programa, programa termina esta semana y siete días sin entrenar durante programa activo con sesiones. Excluir descargas de la señal de inactividad. Sin automatizar cargas.
- Progreso: periodos 4/8/12 semanas comparados con periodo anterior equivalente, enlaces a entrenamientos, esfuerzo/notas en ficha.

## Sin conexión

- Descargar semana vigente explícitamente: contexto, prescripciones, alternativas e historial reciente. Confirmar disponibilidad después de persistir todo; fecha visible.
- Service worker para recursos públicos de interfaz y pantalla local, IndexedDB para datos por cuenta. No cachear HTML/RSC autenticado, fotos privadas ni credenciales.
- Primera entrada y descarga requieren conexión; iniciar solo semana correspondiente; recuperar borradores antiguos iniciados. Identidad estable, misma fecha y duración en reintentos.
- Cola persistente; sincronizar al abrir, recuperar conexión con app abierta o acción manual. No prometer envío con app cerrada. Borrar solo tras confirmación del servidor; rechazo conserva datos y explicación.
- Migrar borradores anteriores sin pérdida; aislar cuentas. Antes de logout con pendientes, sincronizar o confirmar eliminación local. Evitar activar actualizaciones durante entrenamiento.

## Publicación y aceptación

- Verificación coach + tres alumnos (incluido entreno del coach), Chromium y WebKit, guía de comprobación en teléfonos físicos sin afirmar ejecución no realizada.
- Actualizar CI, autenticación, recursos privados, respaldo/restauración y documentación. Verificar proyecto remoto exclusivo Iron Strength antes de modificarlo. No transferir automáticamente datos locales a producción.
- Toda tabla nueva: RLS, pgTAP, cascada de borrado; actualizar copias/exportación/tipos. No ampliar service role. Mantener compatibilidad con entrenamientos existentes.
- Tests primero; check por tarea, SQL/integración al tocar DB y E2E al tocar pantallas. Bases destructivas exclusivamente aisladas; conservar desarrollo interactivo. Corregir fallos antes de avanzar. Commit por tarea.
