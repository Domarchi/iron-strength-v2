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

## T145

Metadatos opcionales de grupo y descanso por ejercicio, invariantes diferidas de tamaño/contigüidad/descanso común, disolución al borrar uno de dos integrantes y dominio de bloques. No cambia aún los controles del editor ni el recorrido del logger (T146–147). Se reutilizan RLS y revisión de sesión.

Tests primero; check completo en verde (392 pruebas), 320 comprobaciones SQL y 216 integración. El reordenamiento de T143 revierte completo si divide un grupo. Migración aplicada al desarrollo sin reset; misma huella de perfiles/programas/entrenamientos antes/después, excluyendo las columnas nuevas nulas.

## T146

- Selección de dos a cuatro ejercicios consecutivos, agrupación/separación, salida de un integrante después del bloque, orden interno con flechas y movimiento del bloque por arrastre/teclado. Descanso prescrito por ejercicio o grupo.
- `configure_session_layout` guarda orden/grupos/descansos completos con revisión, recibo y RLS, sin modificar series/repeticiones/peso/notas. Peticiones inciertas recuperables en el borrador.
- Pasan 329 comprobaciones SQL y 219 integración. Check final: 396 pruebas, formato/lint/tipos/build en verde. Migración aplicada al desarrollo conservando la huella de datos.
- Primera suite E2E: 44/46. Corregida comparación de borradores que dependía del orden de propiedades JSON al incorporar un campo opcional (regresión unitaria añadida); el orden real del bloque era correcto, pero el selector de título nuevo exigía un espacio no presente en el nombre accesible. Validación final: 46/46 E2E en verde, sin reintentos, incluyendo comprobación móvil y accesibilidad del grupo.

## T147

- Rondas derivadas de series de trabajo, con cantidades desiguales, omisiones y calentamientos excluidos. Registro y teclado avanzan al integrante pendiente; el descanso se inicia cuando termina la ronda. El cambio de descanso se comparte en el grupo solo dentro del borrador.
- Contexto y borrador conservan grupos y descansos prescritos; recuperación del integrante pendiente y del tiempo absoluto restante. Los borradores antiguos mantienen su comportamiento y formato compatibles.
- Pruebas primero: fallaron el módulo de rondas ausente y la precarga/persistencia de metadatos. Check final: 401 pruebas, formato/lint/tipos/build en verde; 220 integración en la instancia aislada. 47/47 E2E en verde, sin reintentos; incluye calentamiento, teclado, rondas desiguales, recarga, descanso compartido y guardado único.

## T148

- Duplicación de sesión, copia de semana y asignación regeneran cada grupo por sesión mediante una copia completa; conservan descansos, notas y prescripciones. Copia individual fuera del grupo con descanso propio. Duplicación reintentada conserva las identidades de la primera copia.
- Cuatro regresiones de integración fallaron antes de implementar. Check: 401 pruebas, formato/lint/tipos/build en verde. Validación final SQL: 339 comprobaciones; integración: 224. Se conserva el error «no encontrado» para programas invisibles después de detectarlo en la primera pasada SQL.
- Migración aplicada al desarrollo sin reset: comparación completa, incluidos metadatos nuevos, confirma tres perfiles, dos programas y ocho entrenamientos idénticos. 47/47 E2E en verde, sin reintentos, incluyendo creación/asignación/ejecución agrupada.

## T149

- Panel modal nativo por ejercicio: diez entrenamientos, paginación estable por fecha/ID, todas las ocurrencias y calentamientos, enlaces al detalle en otra pestaña. Consulta con el cliente autenticado y RLS; la acción usa la identidad de la sesión, nunca un alumno enviado por el navegador.
- El registro y el temporizador permanecen montados; el panel tiene carga, vacío, error y reintento. Escape y cierre devuelven al control original.
- Pruebas primero con módulo ausente; 227 integración en verde. Check: 401 pruebas, formato/lint/tipos/build en verde. Primera suite E2E: 47/48; el foco no volvía al botón al desmontar el diálogo. Se retiró el autoFocus previo a showModal y el cierre restaura explícitamente el control original. Check reparado en verde; reejecución completa: 48/48 E2E, sin reintentos.

## T150

- Prescripción visible y comparación desplegable con fecha/series anteriores, sugerencia y motivo (series incompletas o repeticiones pendientes). Se mantiene el cálculo de progresión existente.
- Copia explícita de fila, última ejecución o sugerencia: las series completadas no cambian. La sugerencia solo afecta trabajo pendiente; conserva calentamientos, prescripción y temporizador. Copias múltiples admiten Deshacer. Valores fuera de los límites de registro no se aplican.
- Cuatro regresiones unitarias fallaron primero; check en verde con 405 pruebas, formato/lint/tipos/build. Sin cambio de esquema ni permisos. 49/49 E2E en verde, sin reintentos, incluyendo comparación, protección de series hechas, Deshacer y recuperación.

## T151

- Alternativas por ejercicio (máximo tres, prescripción propia, sin duplicados ni autorreferencia), RLS de lectura y escritura, bloqueo de semanas actuales/pasadas, revisión y recibos para guardado atómico. Cambiar el original tampoco puede producir una autorreferencia. Cascadas verificadas al borrar cuenta.
- Editor con búsqueda, campos propios, borradores de texto incompleto, peticiones inciertas y comparación local/actual para conflictos. La vista bloqueada muestra alternativas y metadatos de grupo/descanso. Copias de fila/sesión/semana/asignación generan alternativas independientes.
- La primera copia en una sola consulta no permitía que RLS viera los padres recién insertados. Corregida con comandos separados dentro de la misma transacción, sin ampliar permisos. Pasan 230 integración y 357 comprobaciones SQL, incluidas restricciones de duplicados, rango y catálogo archivado.
- Check: 408 pruebas, formato/lint/tipos/build en verde. Primera suite E2E: los dos casos nuevos de alternativas pasaron; la prueba de arrastre usaba una distancia fija menor que el nuevo centro de las tarjetas. Corregida para usar geometría real. Check final nuevamente en verde y 51/51 E2E sin reintentos, incluida asignación al propio coach y vista bloqueada.
- Migración aplicada al desarrollo sin reset, con huella completa idéntica de tres perfiles, dos programas y ocho entrenamientos.

## T152

- Elección explícita entre original y alternativas autorizadas antes de completar series. Reemplaza valores pendientes con su prescripción, conserva posición/grupo/descanso y admite Deshacer. La elección y opciones se recuperan al recargar; historial, comparación y progresión usan el ejercicio realizado.
- La base valida también INSERT directo, deriva nombres canónicos, impide mezclar identidades y evita quitar la rutina para eludir permisos. El historial conserva original/realizado incluso al borrar la rutina; exportación incluye el nombre prescrito. Compatibilidad con registros antiguos y edición de sus valores.
- Pruebas primero: fallaron sustitución ausente, aceptación de ejercicio arbitrario y desvinculación de la rutina. Validación SQL: 364 comprobaciones; integración: 234. Check: 413 pruebas, formato/lint/tipos/build en verde. Se corrigieron fixtures antiguos sin ejercicios planificados y el mock de contexto para reflejar el nuevo contrato.
- Primera suite E2E: 47 pasaron, dos fallaron y tres dependientes no corrieron. La nueva sustitución pasó. Corregidos fixtures de exportación (creaba el nombre de prueba modificando identidad histórica) y recuperación (usaba un ID de fila inventado). La segunda pasada pasó 52/52. Una revisión adicional detectó desempate distinto de posiciones antiguas repetidas: regresión unitaria primero, cliente alineado con SQL por posición/ID. Check final nuevamente en verde y última ejecución completa: 52/52 E2E sin reintentos.
- Migración aplicada al desarrollo sin reset; comparación completa confirma tres perfiles, dos programas y ocho entrenamientos conservados, incluidos grupos, descansos y alternativas.

## T153

- Biblioteca con búsqueda sin tildes por nombre, título y ejercicio; conteos y vista previa de sesiones, ejercicios y series. Títulos opcionales de 80 caracteres junto a A–G, visibles en editor, semana y registro; viajan en todas las copias y asignaciones.
- El título comparte guardado, revisión, recibo, borrador y comparación de conflicto con las prescripciones. Copia completa como plantilla independiente, instantánea coherente, IDs nuevos para sesiones/ejercicios/grupos/alternativas, sin fechas, alumnos ni entrenamientos. Recibos privados con RLS y cascada; peticiones locales separadas por cuenta/programa/petición y referencia por pestaña.
- Tests primero: búsqueda y persistencia ausentes, título no guardado y copia no disponible. Pasan 238 integración y 378 comprobaciones SQL. Check: 416 pruebas, formato/lint/tipos/build en verde. Se actualizó la comprobación de firma de la RPC por su nuevo argumento opcional.
- Primera suite E2E: 52/54. El conflicto de títulos pasó; la copia llegó a su aviso correcto, pero el selector coincidía también con el anunciador de Next. El flujo principal usaba texto parcial que ahora encontraba la etiqueta del título. Se precisaron los selectores y se añadió comprobación de error visible al duplicar con catálogo archivado. Check final nuevamente en verde y 54/54 E2E sin reintentos, incluida recuperación de petición de copia y modificación independiente de la nueva plantilla.
- Migración aplicada al desarrollo sin reset. Huella completa conservada de tres perfiles, dos programas y ocho entrenamientos.

## T154

- Edición múltiple con campos explícitos de series, rango y descanso, vista previa, aplicación al borrador y guardado atómico. En grupos exige todos los integrantes y cambia el descanso de ronda. Se conserva la preparación incompleta tras recargar y se pueden editar notas/peso después de aplicar el lote.
- SQL valida la lista de campos y preserva los no elegidos, también al revisar un conflicto con cambios remotos. Se mantienen revisión y recibos para confirmar respuestas perdidas. Tests primero: cuatro reglas unitarias y tres casos de integración fallaron antes de implementar.
- Check: 421 pruebas, formato/lint/tipos/build en verde. Pasan 241 integración y 383 comprobaciones SQL. Migración aplicada al desarrollo sin reset, con huella completa idéntica de tres perfiles, dos programas y ocho entrenamientos.
- Primera suite E2E: 55/56; el caso nuevo de notas intentaba escribir antes de desplegar su campo. Corregido el recorrido de prueba. Check final en verde y segunda suite completa: 56/56 E2E, sin reintentos, incluyendo recuperación incompleta, notas/peso conservados, edición posterior al lote, accesibilidad a 360 px y respuesta perdida de descanso de grupo.

## T155

- Día orientativo opcional del coach, con revisión, guardado atómico, recibos, recuperación y comparación de conflicto junto al título. Copias de ejercicio/sesión/semana/programa y asignación conservan la prescripción correspondiente; la copia individual no cambia el día de la sesión.
- Elección personal del día dentro de la semana vigente, restauración del sugerido, RLS por alumno y lectura del coach. Se conserva la rutina y su revisión; las elecciones no se copian y caen al borrar sesión/cuenta. La base bloquea días inválidos, cuentas ajenas, semanas pasadas/futuras y cambios directos del día prescrito en semanas bloqueadas.
- Mi semana muestra fecha, sesiones previstas, pendientes y hechas. El inicio sigue disponible cualquier día de la semana y no cambia el cumplimiento. Tests primero con módulos ausentes. Check: 425 pruebas, formato/lint/tipos/build en verde; integración final: 243; SQL final: 398 comprobaciones.
- Migración aplicada al desarrollo sin reset, con comparación completa idéntica de tres perfiles, dos programas y ocho entrenamientos.
- Primera suite E2E: 53/57. Se precisaron selectores antiguos y se separó la descripción del nombre accesible del nuevo control. Check final en verde; el recorrido nuevo pasó aislado y la segunda suite completa pasó 57/57 sin reintentos, incluidos temas claro/oscuro, entrenamiento del coach, recuperación del día, cambio personal y restauración de la sugerencia.

## T156

- Cierre con esfuerzo opcional 1–10 y nota de 500 caracteres, persistidos inmediatamente en el borrador. Se conservan al seguir entrenando, recargar y finalizar; el reintento mantiene identidad, fecha, duración y valoración. La confirmación usa diálogo nativo, foco contenido/restaurado y desplazamiento a 360 px.
- Guardado atómico con restricciones SQL, lectura privada por RLS existente, compatibilidad con registros antiguos sin valoración. El detalle reúne ejecución, sustituciones, récords y valoración; el CSV añade esfuerzo/nota neutralizando fórmulas.
- Pruebas primero: payload, borrador, exportación e integración fallaron al no conservar campos nuevos. Check: 428 pruebas, formato/lint/tipos/build en verde. Pasan 244 integración y 404 comprobaciones SQL. Migración aplicada al desarrollo sin reset; perfiles, programas, entrenamientos y días elegidos conservados.
- 58/58 E2E en verde en la primera pasada, sin reintentos. Incluye valoración recuperada tras cerrar/recargar, accesibilidad a 360 × 640, respuesta perdida después de guardar y confirmación posterior sin duplicar series, además del circuito completo existente.

## T157

- Panel con filtro por alumno y señales informativas enlazadas: comentarios pendientes, sin programa vigente/próximo, fin de programa esta semana e inactividad de siete días. No modifica cargas ni programas. Aviso explícito y actualización manual si falla la consulta de no leídos.
- La última actividad requiere series; el plazo empieza como mínimo al iniciar el programa. No se muestra inactividad durante descarga, sin sesiones previstas o para alumnos desactivados. Se conserva acceso a las fichas y a sus contadores existentes.
- Cuatro reglas unitarias partieron con módulo ausente. Se corrigió el fixture de entrenamiento vacío para incluir su ID obligatorio. Check en verde con 432 pruebas, formato/lint/tipos/build; integración: 245. Sin cambios de esquema ni de datos interactivos.
- 59/59 E2E en verde en la primera pasada, sin reintentos. Se prueban tres alumnos, filtros, descarga sin señal de inactividad, apertura del comentario pendiente y respuesta desde el entrenamiento, ausencia del aviso después de leer y acceso a la ficha sin programa. Accesibilidad y ancho de 360 px verificados.

## T158

- Progreso del ejercicio con 4/8/12 semanas (8 iniciales), fechas explícitas hasta hoy en Santiago y periodo anterior equivalente. Se conserva métrica/alumno al navegar. Comparación de mejor 1RM, volumen total o repeticiones; sin tendencias inventadas cuando falta información o la base es cero.
- Marcas históricas identificadas aparte. Tablas del periodo actual/anterior enlazan cada registro al entrenamiento. El gráfico conserva puntos coincidentes sin claves React duplicadas. Ficha del alumno con esfuerzo y nota en entrenamientos recientes, bajo la RLS existente.
- Tres reglas de periodos partieron con módulo ausente y la integración detectó valoración ausente en la lista. Check: 435 pruebas, formato/lint/tipos/build en verde; integración: 246. Sin cambios de esquema ni datos interactivos.
- La suite completa pasó 60/60 en la primera pasada y nuevamente tras reforzar áreas táctiles de los enlaces. Check final en verde. Se verifican filtros, comparación, navegación al registro anterior, valoración en la ficha, accesibilidad y controles de 44 px a 360 px.

## T159

- Paquetes v1 completos por cuenta/programa/semana, con prescripciones, días, alternativas e historial de originales y sustitutos. Identidad derivada de la sesión y comprobación de revisiones/vigencia antes y después de reunir datos. Contrato validado antes de persistir.
- IndexedDB guarda y relee el paquete dentro de una transacción; la interfaz confirma al completarse, recupera la fecha y permite actualizar explícitamente. Errores de cuota/acceso conservan la descarga anterior. No se cachean páginas ni credenciales. La apertura offline corresponde a T160.
- Las reglas unitarias partieron con módulo ausente. La primera integración detectó una expectativa incorrecta del fixture: borrar un programa conserva su historial anterior, que también debe descargarse. Se corrigió la comprobación para incluir ese historial, con un máximo de diez resultados.
- Check final: 438 pruebas, formato/lint/tipos/build en verde; integración: 247. La primera suite E2E pasó 60/61: se precisó un selector antiguo de estado para distinguir cumplimiento y descarga. La segunda suite pasó 61/61, sin reintentos, incluyendo IndexedDB real, recuperación, cuota agotada sin pérdida, actualización y aislamiento entre cuentas. Sin cambios de esquema ni datos interactivos.

## T160

- Pantalla pública local, recursos explícitos por versión de build y contexto privado por cuenta. Navegaciones sin red abren la pantalla local; APIs, HTML/RSC autenticado y fotos quedan fuera de Cache Storage. La interfaz comprueba todos los recursos y repara entradas desalojadas antes de confirmar disponibilidad.
- Registro existente con historial descargado, alternativas y descanso; URL recuperable, sesiones vencidas bloqueadas salvo borrador iniciado. Identidad local actualizada al entrar y oculta antes de enviar logout, incluso si se pierde su respuesta. Compilación interactiva separable de E2E.
- Las rutas públicas fallaron primero. Pasaron las dos pruebas enfocadas iniciales, incluida reapertura con red desactivada tras cerrar pestaña, historial, serie y descanso recuperados, accesibilidad y cierre de sesión.
- Check final: 443 pruebas, formato/lint/tipos/build en verde. Dos pasadas completas de 63/63 E2E sin reintentos. La última verifica además semana vencida recuperable, recurso faltante sin falsa disponibilidad, reparación del caché y cuenta oculta antes de responder logout. El HTML público es idéntico con y sin sesión y no añade cookies.
- Se asigna una identidad única por compilación, compartida por procesos de Next y worker, para evitar mezclar recursos de builds distintos. Tras ese ajuste de empaquetado, check completo nuevamente en verde y 11/11 pruebas enfocadas de apertura, descarga, acceso y seguridad. Sin cambios de base ni datos interactivos.

## T161

- Cola IndexedDB v1 separada del almacén de semanas, por cuenta e ID estable; conserva el primer payload, sustitución, valoración, fechas y duración. Apertura, conexión recuperada y botón manual reintentan; una respuesta perdida se confirma sin duplicar. Panel con detalle y causa del rechazo. Los pendientes anteriores mantienen su origen hasta confirmar.
- Endpoint JSON con sesión activa, cuenta y origen comprobados; no redirige un reintento a HTML. La prueba de navegador detectó que Next reconstruye su URL interna con un host distinto: se corrigió la comparación con el Host público, manteniendo rechazo de otros orígenes y sin confiar en x-forwarded-host. Dos reglas unitarias cubren esta diferencia.
- La base valida alumno, programa y semana de inicio dentro de save_workout y confirma IDs propios ya guardados antes de comprobar la rutina. Las pruebas de idempotencia tras borrar la rutina y de semana incorrecta partieron en rojo. Reset aislado, 408 pgTAP y 249 pruebas de integración en verde. Migración 99 aplicada a la instancia interactiva: mismos tres perfiles, dos programas y ocho entrenamientos, con huella de datos idéntica.
- Check en verde con 448 pruebas, formato, lint, tipos y compilación. Se actualizó la prueba de recuperación para verificar reintento automático y manual conservando el borrador ante fallo; IndexedDB no disponible permite intentar guardado online.
- Tras corregir el origen, 19/19 E2E enfocadas y 66/66 de la suite completa, sin reintentos. Incluyen terminar y reabrir offline, pérdida de respuesta, duplicado confirmado, sesión expirada, cuenta distinta, origen ajeno, rutina eliminada y cuota agotada. El registro se conserva ante rechazo y aparece una sola vez al sincronizar.
