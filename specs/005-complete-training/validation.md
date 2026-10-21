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

## T162

- Sobre local v2 compatible con contenido v1: escritura y relectura confirmadas antes de limpiar el origen. Cuota, datos desconocidos y borradores distintos conservan los registros anteriores. Una copia ya confirmada no pierde su estado guardado si solo falla la limpieza de v1. Confirmar o descartar limpia únicamente el ID correspondiente.
- Cierre de sesión con comprobación de entrenamientos, cola y borradores del coach: volver, sincronizar o eliminar explícitamente. Limpieza por cuenta de IndexedDB y formatos locales, incluidos desconocidos; conserva otras cuentas. El borrado de cuenta limpia el dispositivo después del servidor y permite reintentar la limpieza. Otras pestañas ocultan su contenido al cambiar la identidad; los envíos pendientes exigen la misma cuenta activa.
- Workers con URL inmutable: no registrar otra versión mientras haya borradores de entrenamiento, incluso de una pestaña cerrada o de otra cuenta. La interfaz actual completa permite seguir descargando datos sin actualización. No se fuerza recarga ni skipWaiting.
- Reglas de migración y separación partieron en rojo. La revisión añadió un caso de convivencia v1/v2 con distintos IDs: la primera prueba detectó que la confirmación dejaba el pendiente antiguo sin limpiar; se corrigió sin tocar el otro entrenamiento. Check final: 458 pruebas, formato/lint/tipos/build en verde. Sin cambios de esquema ni datos interactivos.
- La primera preparación E2E detectó un identificador ausente en el fixture de borrado; corregido. 15/15 E2E enfocadas pasaron: migración con cuota agotada, recuperación exacta de valores/nota/descanso, cancelación del cierre, sincronización antes de salir, limpieza propia con datos ajenos conservados, segunda pestaña oculta, eliminación local al borrar cuenta y flujos offline previos.
- Suite completa final: 68/68 E2E sin reintentos, con la última corrección de limpieza incluida. La pasada anterior se interrumpió para incorporar ese caso antes de repetir la verificación completa.

## T163

- Selectores y texto multilínea comparten superficie, borde, radio, foco y tipografía móvil con los campos existentes. Mensajes de estado/error y vistas vacías reutilizables, sin alterar el significado de guardado/pendiente. Textos largos ajustan sin desbordamiento; todas las variantes de botón conservan 44 px; movimiento reducido limita duración e iteraciones.
- Salir desde el editor con cambios usa una sola confirmación de pendientes locales; otras salidas mantienen su protección. El enlace para saltar al contenido aplica su relleno y tamaño al recibir foco, conservando su ocultación inicial.
- Pruebas primero a 360 px, ambos temas, nombres largos sin espacios, controles/etiquetas de 44 px, foco, teclado decimal, texto de 16 px, movimiento reducido y axe AA. Se corrigió el fixture de finalización para registrar un peso válido. Dos E2E enfocadas pasaron y sus capturas se revisaron visualmente.
- Check: 458 pruebas, formato/lint/tipos/build en verde. Una pasada completa detectó una carrera del fixture de migración (inyectaba v1 antes de terminar la inicialización de la cuenta); se añadió espera observable de identidad antes de simular cuota. Los datos ya estaban confirmados en v2; no hubo pérdida. Sin cambios de base ni datos interactivos.
- Suite completa final: 70/70 E2E, sin reintentos. Incluye registro, editor, guardado, aislamiento, sincronización, temas y accesibilidad, con los componentes visuales compartidos.

## T164

- Chromium móvil y WebKit con perfil iPhone, una sola base aislada y un worker. Se añadió un recorrido con cuatro sesiones independientes: coach y tres alumnos registran esfuerzo/nota, el coach revisa y comenta, cada alumno ve su respuesta y no puede leer registros ajenos. Lectura independiente confirma cuatro registros y cuatro propietarios.
- Se corrigió la espera del helper de login: espera el destino final y la cabecera, evitando navegar mientras se resuelve la redirección. La prueba de privacidad comprueba la pantalla not-found y ausencia de datos; Next puede haber iniciado streaming con HTTP 200 antes de resolver notFound.
- La primera pasada WebKit encontró las limitaciones de su emulación de desconexión y de interceptar peticiones con service worker. Los casos usan ahora un proxy local por prueba que corta sockets, bloquea recursos y descarta una respuesta después del commit. No modifica código del producto ni simula confirmaciones. Un control negativo comprueba que el servidor resulta inaccesible mientras el worker sí abre la app. Los 14 casos enfocados de ambos motores pasaron.
- Check con 458 pruebas, formato/lint/tipos/build en verde. Reset exclusivamente aislado con las 36 migraciones, 408 pgTAP y 249 pruebas de integración en verde.
- Preparación manual aditiva: se añadió solo el tercer alumno y tres copias de programa para las cuentas sin programa. Una segunda ejecución hizo cero cambios. Las cuatro cuentas autentican y leen su programa propio; cada fila previa de perfiles, programas, planificación y ocho entrenamientos permanece idéntica. Nuevo estado de referencia: cuatro perfiles, cinco programas, ocho entrenamientos. Credenciales únicamente en el archivo privado local.
- CI instala ambos motores. WebKit local necesitó bibliotecas extraídas fuera del repositorio, sin instalar paquetes del sistema ni modificar ejecutables. Solo el gesto continuo CDP se omite en WebKit; el arrastre por puntero/teclado se prueba allí. `docs/phone-validation.md` distingue explícitamente emulación de Android/iPhone físicos, pendientes de comprobación por HTTPS.
- Pasada completa final: **141 E2E aprobados (71 Chromium y 70 WebKit), un caso CDP omitido en WebKit**, sin reintentos, en 11,8 minutos. Todos los escenarios offline también pasaron en esa misma ejecución.

## T165 — preparación local verificada; comprobación remota pendiente

- CI incluye main y main-54qpxa, ejecución manual, permisos de lectura, checkout sin credenciales persistentes y acciones fijadas a los commits verificados de sus tags v4. Timeout E2E ampliado para ambos motores; clave efímera de la pila de CI enmascarada. YAML comprobado localmente. El workflow todavía no se ha ejecutado en GitHub y no despliega.
- Documentación de despliegue actualizada para 36 migraciones, cuatro cuentas, autenticación por invitación/recuperación, claves separadas, recursos privados, workers, promoción y recuperación. No se exportan automáticamente datos de demostración. Guía independiente de respaldo de base, migraciones y archivos.
- Ensayo únicamente en el servidor aislado 55322: pg_dump custom de PostgreSQL 17.11 y restauración en una base temporal nueva. Se conservaron propietarios/grants usando el administrador del runtime local, tras un primer rechazo por permisos del rol limitado. Coinciden las 57 tablas comparadas, políticas y banderas RLS; un alumno autenticado ve cero entrenamientos ajenos. Objeto sintético de Storage descargado/restaurado con hash idéntico, acceso anónimo rechazado y limpieza del objeto de prueba.
- Tipos regenerados desde la pila aislada idénticos a src/types/database.ts. Check: formato/lint/tipos/build y 458 pruebas en verde. No hay cambios de esquema o pantallas; la suite T164 (141 aprobados, un caso CDP omitido en WebKit) corresponde al mismo código del producto.
- Acceso remoto comprobado mediante herramientas: Vercel ofrece iron-strength (prj_efHmFcgn3IS5Bd4zzNShwGnewXPd), pero sus despliegues pertenecen a Domarchi/iron-strength. Requiere decidir el destino para iron-strength-v2. Supabase CLI no tiene sesión autenticada; no se pudo verificar el proyecto exclusivo udwhjcnlfqlggblnpchu. No se enlazó, migró, desplegó ni modificó ningún recurso remoto. T165 y T166 conservan su estado pendiente por estas comprobaciones.
- Vista previa local recompilada en .next-interactive y reiniciada en el puerto 3000. Se comprobó login del coach, panel con tres alumnos y Mi semana con programa propio. Se conserva la base interactiva y su historial; las credenciales están fuera de Git.

### Decisión de destino y acceso

- El usuario autorizó reemplazar la versión del proyecto Vercel iron-strength por v2. Se volvió a verificar su ID/equipo, Next.js y Node 24, repositorio anterior y dominios. Enlace local preparado en .vercel/project.json (ignorado por Git); no se creó un proyecto nuevo ni se desplegó.
- Tras el aviso de login, `supabase projects list` sigue respondiendo Access token not provided. No hay token en el entorno de comandos ni archivos de sesión habituales; se solicitó completar la autorización de la CLI en la terminal del proyecto. La sesión remota de Supabase todavía no se considera verificada.

### CI remoto y corrección de sincronización

- La rama main-54qpxa se subió a GitHub hasta be907a0. [CI 39501126245](https://github.com/Domarchi/iron-strength-v2/actions/runs/39501126245): código/build y base de datos aprobados (458 unitarias, 249 integración, pgTAP y tipos); E2E terminó con 140 aprobados, un caso CDP omitido y un fallo en WebKit, también en su reintento. No se considera CI completo en verde.
- El fallo de sincronización perdió la respuesta y no observó el estado esperado dentro de diez segundos; otro intento agotó esa misma espera al finalizar offline. La petición admite veinte segundos antes de abortar. Se prepararon esperas de treinta segundos en esas transiciones, conservando los controles de payload congelado y un solo registro. Se añadió texto de diagnóstico de páginas del origen aislado y una repetición enfocada previa a la suite. Estos cambios aún requieren E2E para confirmar la causa y el resultado; no se modificó código del producto.
- La descarga del artefacto desde el navegador fue rechazada por su política de archivos; no se volvió a intentar. Se utilizaron los logs textuales existentes.
- En la configuración restringida anterior, formato/lint/tipos y 458 unitarias pasan; el build local falla al crear un puerto interno de Turbopack (Operation not permitted), y una comprobación mínima de escucha local confirma EPERM. El conector de GitHub también rechazó create_tree porque necesita aprobación y la política de la sesión es never. No se subió la corrección ni se desplegó. El diff está conservado localmente y en work/t166-ci-fix.patch.
- El panel web del usuario confirma iron-strength, referencia udwhjcnlfqlggblnpchu y región us-east-2. Esto verifica la identidad visible; la autorización de la CLI aún debe comprobarse. No se escribieron cambios en Supabase remoto.

### Reanudación de la validación y acceso remoto

- Con los permisos de ejecución restaurados, `npm run check` completo en verde: formato, lint, tipos, 458 unitarias y build con recursos offline. La regresión de respuesta perdida pasó tres veces consecutivas en WebKit, sin reintentos.
- La CLI autenticada confirmó el proyecto exclusivo `udwhjcnlfqlggblnpchu`, nombre iron-strength y región us-east-2. Se solicitó reactivar el proyecto pausado desde su panel, sin cambiar de plan. Enlace local correcto; las consultas de lectura funcionan. La plataforma todavía informa COMING_UP; respaldo e inspección final pendientes antes de migrar.
- Las tres suites offline afectadas por el fixture terminaron con 14/14 E2E aprobados en Chromium y WebKit, sin reintentos. Logs locales privados: t166-resumed-check.log, t166-webkit-repeat.log y t166-offline-validation.log.

- Inspección remota inicial: cero tablas públicas, cero usuarios Auth y ningún historial de migraciones. Dry-run enumera las 36 migraciones sin aplicar cambios. Dumps nativos de roles/esquema/datos obtenidos y protegidos fuera del repo, con hashes; instantánea preliminar que debe repetirse/completarse cuando el servicio esté saludable. Storage aún no tiene tablas y no se considera disponible.
- El [incidente oficial de reinicios](https://status.supabase.com/incidents/01M5DN6V02FJHZTE9390XJM9YY) informa proyectos afectados en us-east-2. El proyecto sigue COMING_UP, por lo que T165 y T166 permanecen pendientes de estabilidad e inspección final. No se aplicaron migraciones ni se publicó en Vercel.
- Corrección guardada y subida en 46bfb7f; [CI 39534078588](https://github.com/Domarchi/iron-strength-v2/actions/runs/39534078588) en ejecución.

### Proyecto remoto recuperado e inspección definitiva

- Supabase llegó a ACTIVE_HEALTHY; las consultas preliminares durante COMING_UP no representaban el esquema restaurado. Se repitió toda la inspección: 14 tablas públicas con RLS, 467 ejercicios, cero cuentas/perfiles/programas/entrenamientos, bucket privado progress-photos y cero objetos.
- Historial: 23 migraciones existentes, versiones y texto normalizado coincidentes con archivos locales. Dry-run definitivo: 13 pendientes (86, 88–99). Sin reparación, reset ni nueva semilla.
- Respaldo activo terminado: cinco SQL de roles, esquema, datos, esquema del historial y datos del historial. Manifiesto privado con tamaños y SHA-256; Storage vacío confirmado. Se conserva el respaldo preliminar separado y no se usa como sustituto de este.
- Configuración Auth guardada: registro público cerrado, Email activo, mínimo de ocho caracteres, Site URL HTTPS del dominio existente. Vercel conserva el despliegue anterior y sus dominios; las claves nuevas están solo en producción, el secreto solo en servidor. Build npm run build y Node 24; autoasignación de dominios desactivada para revisar el build antes de promoverlo.

- Vercel conectado desde el panel al repositorio v2; main-54qpxa como rama de producción, autoasignación desactivada y dominio anterior conservado. Primer intento de build 46bfb7f bloqueado por correo Git automático no válido (friday@F.R.I.D.A.Y). La herramienta no produjo un build; CLI ausente. Motivo confirmado en el panel y documentación oficial de colaboración. Identidad local del repo corregida al noreply de la cuenta GitHub autenticada; próximo commit con coautoría Codex y sin modificar historial previo.
- Auth API responde 200: disable_signup=true, external.email=true, external.anonymous_users=false. La caducidad remota sigue en una hora: el control de seguridad del navegador requiere confirmar su ampliación a las 24 horas de RF-7 y la pregunta quedó pendiente. También se solicitó nombre/correo reales del coach, sin pedir contraseñas por chat.

- CI 39534078588 terminó SUCCESS en sus tres jobs: código/build, base de datos e integración y E2E Chromium/WebKit. Segundo check local completo también aprobado (t165-final-preparation-check.log). No hay cambios del producto desde ese commit; la preparación posterior actualiza documentación y configuración remota.

### Migraciones y build preparado; regresión adicional

- Las 13 migraciones pendientes se aplicaron correctamente al proyecto exclusivo después del respaldo. Listado posterior: 36/36 versiones coincidentes. Catálogo 467/hash sin cambios, cero perfiles/entrenamientos, bucket privado y todas las tablas públicas con RLS. Contrato remoto/local idéntico en 130 columnas, 35 funciones (incluidos permisos de ejecución anon/authenticated/service_role) y 48 políticas. Las diferencias del generador remoto son de formato/versión; no se sustituyen los tipos del runtime local ya verificados.
- Commit 7229aea reconocido por GitHub como Domarchi, con coautoría Codex. Vercel compiló automáticamente dpl_CtRiEGGmfDGfyLbs8g6NsukKFYnJ en producción Staged, READY. Login, manifiesto, offline y worker versionado responden 200; build confirma 58 recursos, sin registros error/fatal encontrados. Dominio principal sin promover.
- Al leer el informe completo, CI 39534078588 tiene 140 casos aprobados, un CDP omitido y un T156 aprobado en reintento. CI posterior 39535433186 falla la regresión T161 en WebKit (apertura offline/error pendiente). Se mantiene pendiente la validación final.
- T156 se separa en un archivo con el fixture de red; mezclar dos tipos de fixtures en un archivo hacía que el hook afterEach recibiera parámetros desconocidos. La reproducción posterior mostró una espera incorrecta: la región pendiente existe mientras se guarda. También el panel T161 puede mostrar un error persistido mientras una petición nueva sigue en curso. Las pruebas esperan el fallo actual y la finalización del transporte antes de restaurar la API y recargar. Se conservan payload e idempotencia.

- La reproducción local con el transporte permitió ver otra carrera: Chromium puede reintentar automáticamente un POST cuya respuesta se corta. Se añadió bloqueo opcional de peticiones posteriores al primer corte, hasta comprobar el pendiente y restaurar explícitamente la API. Los bloqueos de API devuelven 503 desde el proxy sin alcanzar el backend; los documentos/recursos mantienen el corte de socket real. Esto evita peticiones WebKit inconclusas al cerrar la última página.
- Regresión local nueva: ambos casos T156/T161, tres repeticiones por motor, 12/12 aprobados sin reintentos (t166-response-transport-regression.log). CI exigirá estas repeticiones enfocadas con retries=0. Se mantienen las comprobaciones de valores congelados, nota/esfuerzo, sustitución y un solo entrenamiento. Las pruebas offline restantes se vuelven a ejecutar por el cambio del fixture común.

- Suite completa afectada por el fixture de red: 16/16 casos en Chromium y WebKit aprobados, sin reintentos (t166-all-offline-transport-validation.log). La reproducción previa aprobó los 26 casos restantes del archivo móvil y la variante WebKit de T156; T156 ahora vive en su archivo de transporte y está cubierto por las 12 repeticiones y la suite de 16. No se cambió código del producto.
- Check final de la corrección del transporte completo en verde: formato, lint, tipos, 458 unitarias y build (t166-final-transport-check.log). No se modificaron migraciones ni archivos del producto.

- CI 39536793610 de 70a2e41 vuelve a fallar en la repetición T161 de WebKit, antes de la suite completa: permanece Guardando al finalizar offline. Código/build y base/integración están verdes. No se promovió el build.
- Reproducción local restringiendo Node/Next/WebKit a dos CPU: diez repeticiones T161, 10/10 aprobadas sin reintentos (t166-webkit-two-cpu.log). Los logs confirman Ubuntu 24.04 en ambos runners remotos; no se atribuye el fallo al aviso de futura migración a Ubuntu 26.
- Se añaden diagnósticos de rutas/resultados de la API aislada y estados de apertura/transacción IndexedDB, visibilidad y worker. No registran payload, valores almacenados, cookies, cabeceras o credenciales. Sirven para distinguir almacenamiento pendiente de una petición de red que no termina.

### Actualización del motor E2E

- Playwright estaba fijado por lock a 1.63.0, con WebKit 26.6 r2359. Existe una regresión documentada de almacenamiento al reutilizar procesos de service worker ([Playwright #42694](https://github.com/microsoft/playwright/issues/42694), [WebKit #74082](https://github.com/WebKit/WebKit/pull/74082)). Su firma coincide con el bloqueo observado; se trata como hipótesis hasta comprobar el circuito remoto. No se desactiva el worker ni se omite el caso.
- Actualización menor a Playwright 1.64.1, versión exacta y lockfile; Chromium 156.0.8078.4 y WebKit 27.2 r2370 arrancan localmente. Solo cambian los tres paquetes de Playwright. Bibliotecas auxiliares locales enlazadas al runtime descargado, sin instalación global. Check completo: formato/lint/tipos, 458 unitarias y build aprobados (t166-playwright-164-check.log). Regresión y suite completa pendientes con el motor nuevo.
- npm audit --omit=dev: cero avisos. El audit completo informa nueve avisos de la cadena de herramientas de desarrollo que usa braces; son dependencias preexistentes y no se ejecuta la sugerencia de cambios mayores/downgrades de npm audit fix --force. La actualización de Playwright no modifica esa cadena.

- Con Playwright 1.64.1: 12/12 repeticiones de respuestas perdidas en Chromium/WebKit aprobadas, sin reintentos (t166-playwright-164-regression.log). Se conserva la misma lógica de aplicación y las mismas comprobaciones. La suite completa local y CI se ejecutarán con este commit antes de promoverlo.

- Con el motor nuevo, CI 39538449817 aprobó código/build, base/integración y las seis repeticiones WebKit de respuestas perdidas. La suite local completa detectó después otro error de preparación: T158 insertaba el entrenamiento de hoy a las 15:00 UTC incluso antes de esa hora. El trigger rechazaba el registro futuro y el helper ignoraba el error; faltaban esfuerzo y nota en la ficha. Se interrumpió la pasada local y se canceló CI antes de publicar.
- El helper E2E limita inicio y fin a la hora actual, conserva la fecha de Santiago y la hora histórica de los días anteriores, y falla explícitamente ante errores al insertar entrenamiento o serie. No se modifica producto ni base. T158 y la suite completa requieren otra pasada antes de promover.
- Corrección de la hora de la semilla: check completo aprobado (458 unitarias, formato/lint/tipos/build) y T158 en Chromium/WebKit 2/2 sin reintentos antes de las 15:00 UTC. Logs t166-seed-clock-check.log y t166-seed-clock-regression.log. Se repiten suite local completa y CI del commit resultante; no se publica mientras estén pendientes.

### Orden de la última ejecución

- La repetición completa de 81c5f4c detectó T150 en Chromium: copiar la segunda serie anterior devolvía 10 repeticiones en lugar de 9. La consulta del contexto no ordenaba el agregado workout_sets; el orden de lectura podía intercambiar las series. Se interrumpieron la suite local y CI antes de publicar.
- Especificación aclarada: posición, número de serie e ID como desempate determinan la secuencia de última ejecución, comparación y copia. Una prueba de integración inserta las series al revés, con IDs que conservan ese orden inverso: falló con [9, 10] en lugar de [10, 9] antes de corregir la consulta. Se añade orden explícito al agregado PostgREST; sin cambios de esquema ni permisos. El contexto descargado reutiliza esta misma consulta.
- Corrección verificada: 250/250 pruebas de integración (36 archivos), check completo con 458 unitarias y T150 en Chromium/WebKit 2/2, sin reintentos. Logs t166-order-regression-red.log, t166-order-integration.log, t166-order-check.log y t166-order-browser-regression.log. La suite completa y CI se repiten en el siguiente commit, sin promover los builds anteriores.

### Cierre de validación y publicación de acafce4

- Suite local completa: 141 E2E aprobados en 12,3 minutos, sin reintentos; un gesto continuo CDP omitido exclusivamente en WebKit. Log t166-order-full-e2e.log. La comparación de la base interactiva mantiene perfiles, programas, prescripciones y entrenamientos idénticos, huella 91f59c7cb0c45efd96eb0ce57a4e77c68d3c31e6879d8dbc7e6931137cecbf1a.
- [CI 39539977730](https://github.com/Domarchi/iron-strength-v2/actions/runs/39539977730) terminó SUCCESS en los tres jobs: check con 458 unitarias, migraciones/408 pgTAP/tipos/250 integración y navegador. Regresión WebKit: seis repeticiones aprobadas con retries=0. Suite completa: 141 aprobados y un CDP omitido, sin errores ni casos flaky, en 16,3 minutos. Logs textuales t166-ci-acafce4-e2e.log y t166-ci-acafce4-database.log; no se descargaron artefactos remotos.
- Supabase exclusivo permanece ACTIVE_HEALTHY. Build Staged READY dpl_3yJM97giPeVYPxtWteBQkTEAphz3 corresponde exactamente a acafce4a0d8fbae8837e3d618c7c16a6f4723cc9. Se promovió ese mismo build sin recompilar, conforme al destino aprobado; el alias iron-strength-seven.vercel.app ahora apunta a él. Se mantuvo autoAssignCustomDomains=false para las siguientes publicaciones.
- Verificación pública HTTPS: login, offline, manifiesto, icono 192 y worker ec41f2a47a4c496f9b1103ef21a8a841 responden 200. /week sin sesión termina en login; HTML privado y worker con no-store. Build confirma 58 recursos; no se encontraron registros error/fatal ni errores de consola en la comprobación del acceso. App abierta en el navegador y apertura solicitada también al panel de Codex; este último devolvió queued. Captura privada de prueba sin datos de acceso: outputs/t166-produccion-login.jpg.
- Vista previa local recompilada en .next-interactive y reiniciada en 3000; login responde 200. Solo se revirtieron los cambios automáticos de rutas de tipos/configuración generados por ese directorio de build, conservando los archivos versionados.
- T165/T166 siguen sin marcar: caducidad remota de recuperación de una hora pendiente de decisión frente a RF-7; nombre/correo del coach pendientes; todavía no hay cuatro cuentas reales ni prueba física Android/iPhone en producción. La guía de teléfonos incluye el recorrido breve por rol. No se copian cuentas o datos locales ni se inventan destinatarios.

### T165 cerrado; alta inicial del coach (T166)

- El propietario proporcionó nombre/correo y confirmó expresamente las 24 horas de recuperación. Proyecto exclusivo comprobado de nuevo ACTIVE_HEALTHY. Proveedor Email: guardados 86400 segundos; reapertura del formulario confirma ese valor y Save deshabilitado. Captura privada t166-recuperacion-24h.jpg.
- Alta inicial encontró Invalid API key: el listado CLI devolvía una representación de clave secreta con 26 caracteres de enmascaramiento, guardada anteriormente como variable. Clave publicable válida y clave heredada administrativa válida permitieron distinguirlo de un fallo del proyecto. CLI --reveal obtuvo la clave completa; se comprobó su formato y acceso con el cliente de servidor. Archivos privados con permisos 600, sin imprimir valores. Variable sensible de Vercel corregida solo en producción.
- Base antes del alta: cero perfiles y cero usuarios. createCoach existente creó una sola cuenta con la identidad indicada por su propietario; verificados rol coach, activo, correo confirmado y coach_id propio. Contraseña temporal aleatoria en memoria, no conservada; enlace de recuperación privado generado después del ajuste de TTL. Abrir el formulario no verifica ni consume el token. La contraseña final queda para el propietario mediante handoff; no se transmite por el chat ni se crean alumnos ficticios.
- Recompilación del mismo acafce4 con el secreto correcto, READY en dpl_CSsK8f9Vw33veqLniQrRi8emft1V. Prueba Staged del control de acceso: identidad sintética inexistente recibe Correo o contraseña incorrectos y genera exactamente un fallo no bloqueado en login_attempts, confirmando navegador → acción → guard/DB → respuesta con la clave nueva. Sin usuario creado ni correo enviado; consola sin errores. Recursos login/offline/manifiesto/worker disponibles; build genera 58 recursos.
- Promovido el mismo build comprobado, sin nuevo cambio de código; alias público apunta a dpl_CSsK8f9Vw33veqLniQrRi8emft1V y autoAssignCustomDomains=false conservado. BUILD_ID 11698536dd4a4588a78e906f925f44d7. Formulario privado de contraseña abierto en Chrome y solicitado al panel Codex (queued), sin envío del formulario por el agente. Guía privada de acceso fuera de Git.
- T165 puede marcarse completa. T166 sigue pendiente del primer acceso del propietario, tres alumnos y pruebas en teléfonos físicos. La suite del código publicado sigue siendo CI 39539977730, aprobada sin reintentos; CI documental posterior 39542062734 también terminó SUCCESS. No se repite E2E por el cambio exclusivo de configuración; se verifica el flujo real afectado del servidor.
- Check posterior completo aprobado: formato, lint, tipos, 458 unitarias y build con 58 recursos offline (t166-coach-configuration-check.log). Verificación pública del build corregido: login 200/no-store, BUILD_ID esperado y worker 200. Sin registros error/fatal en la ventana inspeccionada. Solo se actualiza documentación; la contraseña personal y el primer acceso siguen a cargo del propietario.
