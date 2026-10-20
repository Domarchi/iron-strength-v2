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
- La ronda se deriva del ordinal de las series de trabajo; ignora calentamientos y ejercicios saltados. Al recuperar se indica el integrante con la primera ronda pendiente. Completar una serie adelantada no inicia descanso mientras quede pendiente una ronda anterior. Deshacer restaura series y temporizador juntos.
- Tras cada serie de trabajo avanzar al siguiente integrante pendiente de la ronda. Descansar al acabar ronda; cantidades distintas de series continúan con los pendientes. Calentamientos no avanzan la ronda.
- Descanso opcional prescrito por ejercicio/grupo: 0 o 15–600 s. Sin prescripción conservar 90 s trabajo/60 s calentamiento. Ajuste del alumno solo afecta su entrenamiento y próximos descansos.
- Copiar sesión/semana/asignar conserva grupos y descansos con nuevas identidades. Duplicar ejercicio individual lo deja fuera del grupo y conserva su descanso individual. Cada sesión copiada recibe grupos propios incluso si proviene de otra copia; reintentar una duplicación con el mismo ID confirma las mismas identidades.

## Contexto y alternativas

- Panel dentro del registro: diez entrenamientos recientes por ejercicio, series y paginación. No desmontar registro ni descanso. Paginar por fecha e ID para conservar entrenamientos con la misma fecha; mostrar todas las ocurrencias del ejercicio y sus calentamientos. El detalle completo se abre en otra pestaña para conservar el registro en curso. Separar prescripción, última ejecución y sugerencia explicada. La comparación desplegable mantiene compacto el registro y explica si faltan series o repeticiones. Copiar una fila o la última ejecución es explícito y no cambia series hechas; copiar la sugerencia afecta únicamente trabajo pendiente y admite Deshacer. La prescripción y el descanso vigente no cambian.
- Hasta tres alternativas por ejercicio, catálogo activo, sin duplicados ni autorreferencia, cada una con series/rango/peso opcional. Se copian con la rutina y al duplicar un ejercicio, con IDs independientes. Edición de alternativas y prescripción principal se guardan por separado; una bloquea la otra mientras esté pendiente. Alternativas pendientes y solicitudes inciertas sobreviven a la recarga. Resolver un conflicto muestra alternativas locales y actuales antes de aplicar la revisión elegida. Las alternativas archivadas ya asignadas siguen siendo legibles; no se añaden ni copian alternativas archivadas.
- El alumno puede elegir alternativa autorizada solo antes de completar series del ejercicio. Mantener posición/grupo. Registrar prescrito y realizado; historial/récords corresponden al realizado. Validar autorización también en SQL, incluso mediante inserciones directas de series: el ejercicio realizado debe ser el original de esa posición o una alternativa vigente de esa fila. Un entrenamiento no mezcla ejercicios distintos en la misma posición. Los registros antiguos sin identidad prescrita siguen legibles y editables en sus valores; la identidad de series guardadas no se reescribe. Los nombres prescritos se conservan aunque se borre la rutina. Amplía RF-26; no permite agregar ejercicios arbitrarios.

## Planificación

- Buscar plantillas por nombre, título de sesión o ejercicio, ignorando tildes y mayúsculas. Vistas previas con cantidad de sesiones, ejercicios previstos (ocurrencias) y series, sin sumar alternativas como trabajo adicional.
- Duplicar cualquier programa propio como una plantilla independiente, sin alumnos, fechas, registros ni comentarios. Conservar semanas, títulos, prescripciones, notas, alternativas, grupos y descansos con IDs nuevos. Copia atómica desde una instantánea coherente; ID de petición estable y recibo privado para confirmar respuestas perdidas, incluso tras recargar. Una alternativa archivada impide la copia completa y se explica al coach.
- Título opcional de sesión de hasta 80 caracteres, conservando A–G. Se muestra al coach y al alumno, se copia y asigna con la rutina. El título comparte revisión, guardado atómico, borrador y resolución explícita de conflictos con las prescripciones; vacío vuelve a mostrar solo la letra.
- Edición múltiple de 1–15 ejercicios: activar explícitamente series, rango de repeticiones o descanso, revisar vista previa, aplicar al borrador y guardar la sesión atómicamente. Conservar notas, pesos y campos no elegidos también al resolver un conflicto. Las mutaciones de lote indican los campos elegidos; la base valida esa lista y solo actualiza esos campos.
- En superseries, cambiar el descanso requiere seleccionar todos sus integrantes y modifica el descanso de la ronda; fuera de grupos modifica el individual. La selección puede incluir grupos y ejercicios sueltos. La preparación del lote y su aplicación al borrador se recuperan tras recargar; cancelar la preparación no modifica prescripciones.
- Día orientativo opcional por sesión (lunes a domingo), compartiendo guardado, revisión y borrador del título. Viaja en copias y asignaciones; RF-17 también protege cambios directos del día.
- El alumno puede elegir otro día de la semana vigente o volver al día del coach. Su elección privada por sesión no modifica la prescripción ni la revisión de la rutina, no se copia a otros programas y cae al borrar su cuenta o la sesión. La base rechaza cambios sobre semanas pasadas/futuras o sesiones ajenas.
- Mi semana muestra el día efectivo y distingue completadas, pendientes (hoy/pasadas/sin día) y previstas (días futuros). Todas pueden iniciarse cualquier día de esa misma semana; el día nunca bloquea inicio ni altera cumplimiento.

## Seguimiento

- Esfuerzo percibido opcional entero 1–10 y nota opcional hasta 500 caracteres al terminar. Ambos se guardan inmediatamente en el borrador, sobreviven al cierre de la confirmación/recarga y se congelan al finalizar para reintentar el mismo registro. Vacío equivale a no registrar.
- El cierre muestra series y volumen; el detalle guardado reúne ejecución, sustituciones, récords y valoración para alumno/coach. Exportación CSV incluye esfuerzo y nota protegida contra fórmulas. Registros antiguos sin valoración siguen legibles. La base valida rangos también en escritura directa y guarda valoración y series atómicamente.
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
