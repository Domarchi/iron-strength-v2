# Spec 001 — Iron Strength v2 (MVP coach + alumnos)

Estado: BORRADOR para revisión. Prioridades: **P0** = imprescindible, **P1** = MVP completo, **P2** = si sobra tiempo.

## Contexto y objetivo
Iron Strength v1 fue una PWA personal que creció sin especificación y terminó con documentación contradictoria, sin tests y con auth débil. v2 es una reescritura desde cero, pensada para un entrenador que asigna programas por semanas a sus alumnos y sigue su progreso. Principio de producto: **simple para el alumno y que mantenga la motivación**.

## Usuarios / actores
- **Coach**: una persona (el dueño). Diseña programas, invita y asigna alumnos, ve su progreso y comenta. También entrena: puede asignarse programas a sí mismo y registrar sus propias sesiones como cualquier alumno.
- **Alumno**: hoy 2. Solo ejecuta lo asignado, registra series, medidas y fotos, y ve su avance.
- Un alumno pertenece a un único coach. Un alumno nunca ve datos de otro alumno.

## Glosario
- **Programa**: plantilla o copia asignada, de N semanas.
- **Semana**: lunes a domingo, hora de America/Santiago. La semana 1 de un programa siempre empieza un lunes.
- **Sesión planificada**: una de las sesiones (A, B, C...) de una semana del programa, con sus ejercicios prescritos.
- **Entrenamiento**: el registro de una sesión planificada que el alumno realizó, con sus series reales.
- **Sesión cumplida**: un entrenamiento terminado con al menos 1 serie completada. Es la unidad de la racha, del cumplimiento semanal y de los logros.

## Historias de usuario
- H1: Como coach quiero invitar a un alumno con un enlace para que cree su cuenta vinculada a mí.
- H2: Como coach quiero crear un programa de N semanas con sesiones y ejercicios prescritos para asignárselo a un alumno.
- H3: Como alumno quiero ver las sesiones de mi semana y registrar peso y repeticiones de cada serie rápidamente.
- H4: Como coach quiero ver el historial y el progreso de cada alumno para ajustar su programa.
- H5: Como coach y alumno queremos dejar comentarios en una sesión para comunicarnos.
- H6: Como alumno quiero registrar medidas corporales y fotos privadas para ver mi evolución.
- H7: Como alumno quiero ver mi racha, mis récords y un resumen semanal para mantenerme motivado.

## Requisitos funcionales (EARS)

### Cuentas e invitaciones (P0)
- RF-1: CUANDO el coach crea una invitación, EL SISTEMA genera un enlace de un solo uso con vencimiento de 7 días.
- RF-2: CUANDO una persona abre un enlace de invitación válido y completa nombre, correo y contraseña, EL SISTEMA crea una cuenta con rol alumno vinculada al coach que invitó.
- RF-3: SI el enlace está vencido, ya fue usado o no existe, ENTONCES EL SISTEMA rechaza el registro con un mensaje claro.
- RF-4: EL SISTEMA no permite registro público: la única vía de alta de alumnos es una invitación. La cuenta de coach se crea una sola vez por configuración inicial.
- RF-5: CUANDO un usuario inicia sesión con credenciales válidas, EL SISTEMA abre su sesión y lo lleva a la vista de su rol. SI son inválidas, ENTONCES muestra un error genérico sin revelar cuál dato falló.
- RF-6: EL SISTEMA exige contraseñas de al menos 8 caracteres y, tras 5 intentos fallidos consecutivos para un mismo correo, bloquea nuevos intentos durante 15 minutos.
- RF-7: CUANDO un alumno olvida su contraseña, EL SISTEMA permite al coach generar un enlace de restablecimiento de un solo uso (vence en 24 horas) que el coach le entrega. No se envían correos automáticos. (P1)
- RF-8: CUANDO el coach desactiva a un alumno, EL SISTEMA bloquea su acceso y conserva sus datos. (P1)

### Biblioteca de ejercicios (P0)
- RF-9: EL SISTEMA incluye un catálogo base de ejercicios (nombre, grupo muscular, equipamiento) en español, migrado desde v1.
- RF-10: CUANDO el coach crea un ejercicio propio, EL SISTEMA lo agrega a la biblioteca visible para todos sus alumnos.
- RF-11: EL SISTEMA permite que solo el coach cree, edite o archive ejercicios. Un ejercicio usado en un historial no se elimina, se archiva.

### Programas (P0)
- RF-12: CUANDO el coach crea un programa, EL SISTEMA le pide nombre y número de semanas (1 a 16).
- RF-13: EL SISTEMA organiza un programa en semanas; cada semana tiene un conjunto de sesiones (A, B, C...) sin día fijo; el alumno decide el orden y el día en que las realiza dentro de la semana. Cada sesión tiene ejercicios ordenados.
- RF-14: CUANDO el coach agrega un ejercicio a una sesión, EL SISTEMA le permite definir series, rango de repeticiones (mínimo y máximo) y peso objetivo opcional en kg, además de una nota opcional.
- RF-15: CUANDO el coach copia una semana a otra, EL SISTEMA duplica sus sesiones y prescripciones para que las edite.
- RF-15b: CUANDO el alumno abre un ejercicio y en su último entrenamiento de ese ejercicio completó todas las series llegando al tope del rango de repeticiones, EL SISTEMA muestra una **sugerencia visual** de subir el peso (incremento por ejercicio: 2,5 kg por defecto en barra, 1 a 2 kg en mancuernas y máquinas) y volver al mínimo del rango (doble progresión). SI no llegó al tope, ENTONCES sugiere mantener el peso. La sugerencia nunca modifica el programa: si el coach escribió un peso objetivo, ese es el prescrito y la sugerencia es solo una referencia; si no hay peso objetivo, se parte del último peso usado. No aplica a ejercicios de peso corporal ni a rangos fijos (mínimo = máximo). (P1)
- RF-16: CUANDO el coach asigna un programa a un alumno con una fecha de inicio, EL SISTEMA ajusta la fecha al lunes de esa semana o al siguiente lunes y crea una copia independiente (snapshot) para ese alumno. Editar el programa original después no altera lo ya asignado.
- RF-17: CUANDO el coach edita el programa asignado a un alumno, EL SISTEMA aplica el cambio solo a las semanas posteriores a la semana en curso. (P1)
- RF-18: EL SISTEMA permite que un alumno tenga un solo programa activo a la vez.

### Ejecución de sesiones (P0)
- RF-19: CUANDO el alumno abre la app, EL SISTEMA muestra las sesiones pendientes de la semana en curso de su programa activo, indicando cuáles ya hizo, y le permite iniciar cualquiera. SI completó todas, ENTONCES lo indica.
- RF-20: CUANDO el alumno inicia una sesión, EL SISTEMA muestra los ejercicios con las series prescritas y, como referencia, el peso y las repeticiones de su última sesión del mismo ejercicio.
- RF-21: CUANDO el alumno completa una serie, EL SISTEMA registra peso y repeticiones reales y lo marca como hecha.
- RF-22: MIENTRAS hay una sesión en curso, EL SISTEMA conserva el avance en el dispositivo para que un refresco o una navegación no lo pierdan.
- RF-23: CUANDO el alumno finaliza la sesión, EL SISTEMA guarda solo las series completadas y la duración total. SI no hay ninguna serie completada, ENTONCES no guarda un entrenamiento y lo informa; la sesión no cuenta como cumplida.
- RF-24: SI el guardado falla por falta de conexión, ENTONCES EL SISTEMA conserva la sesión en el dispositivo, avisa al alumno y permite reintentar. No descarta datos.
- RF-25: CUANDO termina una semana del programa con sesiones sin hacer, EL SISTEMA las marca como no realizadas y avanza a la semana siguiente sin acumular deuda. (P1)
- RF-26: EL SISTEMA no permite al alumno añadir, quitar ni sustituir ejercicios de su programa. Sí puede ajustar peso y repeticiones de cada serie, desmarcar una serie, agregar series extra a un ejercicio, saltarse ejercicios, marcar una serie como calentamiento y descartar una sesión en curso (con confirmación).
- RF-26b: CUANDO el alumno edita o borra un entrenamiento ya guardado, EL SISTEMA lo permite solo dentro de los 7 días siguientes a su fecha. (P1)
- RF-27: EL SISTEMA ofrece un temporizador de descanso opcional entre series. (P1)

### Progreso, récords y motivación (P1)
- RF-28: CUANDO el alumno completa una serie con un peso o repeticiones nunca antes alcanzados en ese ejercicio, EL SISTEMA lo registra como récord personal y lo destaca al terminar la sesión.
- RF-29: EL SISTEMA calcula la racha como semanas consecutivas en las que el alumno completó todas las sesiones de su programa, y muestra un calendario de constancia.
- RF-30: EL SISTEMA muestra para cada ejercicio un gráfico de progreso (mejor serie o volumen por sesión).
- RF-31: CUANDO el alumno alcanza un hito definido (primera sesión, 4 semanas seguidas, récord, X sesiones), EL SISTEMA le otorga un logro.
- RF-32: EL SISTEMA muestra cada semana un resumen dentro de la app: sesiones cumplidas versus planificadas, récords y variación de volumen.

### Seguimiento del coach (P0 / P1)
- RF-33: EL SISTEMA muestra al coach la lista de sus alumnos con su última actividad y su cumplimiento de la semana. (P0)
- RF-34: CUANDO el coach abre un alumno, EL SISTEMA muestra su historial de sesiones, sus récords, su racha y sus medidas. (P0)
- RF-35: EL SISTEMA muestra al coach los entrenamientos de un alumno apenas se guardan, al abrir o refrescar la pantalla. No hay vista en tiempo real de sesiones en curso. (P1)

### Feedback (P1)
- RF-36: CUANDO coach o alumno publican un comentario en una sesión, EL SISTEMA lo asocia a esa sesión con autor y fecha.
- RF-37: EL SISTEMA marca como no leídos los comentarios nuevos para la otra parte. (P1)

### Medidas corporales (P1)
- RF-38: CUANDO el alumno registra una medida (peso, cintura, pecho, brazo), EL SISTEMA valida que sea un número mayor que cero y la guarda con la fecha.
- RF-39: EL SISTEMA muestra la evolución de cada medida en un gráfico, visible para el alumno y su coach.

### Fotos de progreso (P1)
- RF-40: CUANDO el alumno sube una foto de progreso, EL SISTEMA la reduce en el dispositivo, la guarda en almacenamiento privado y la asocia a una fecha.
- RF-41: EL SISTEMA solo entrega una foto mediante un enlace firmado de corta duración a su dueño y a su coach.
- RF-42: CUANDO el alumno elimina una foto, EL SISTEMA la borra del almacenamiento de forma definitiva.
- RF-43: SI el archivo no es una imagen o supera el tamaño máximo, ENTONCES EL SISTEMA lo rechaza con un mensaje claro.

### Transversales
- RF-44: EL SISTEMA aplica RLS en todas las tablas: el alumno solo accede a sus datos y el coach solo a los de sus alumnos y a los propios. (P0)
- RF-49: CUANDO el coach se asigna un programa a sí mismo, EL SISTEMA lo trata como un alumno más de su propia cuenta y le da la misma experiencia de ejecución, progreso y récords. (P0)
- RF-45: EL SISTEMA funciona como PWA instalable, adaptada a móvil, con modo claro y oscuro. (P1)
- RF-46: EL SISTEMA muestra estados de carga, vacío y error en toda pantalla que consulta datos; nunca queda cargando indefinidamente. (P0)
- RF-47: EL SISTEMA permite exportar el historial de un alumno a CSV, al coach y al propio alumno. (P2)
- RF-48: CUANDO el alumno solicita borrar su cuenta, EL SISTEMA elimina sus datos y fotos. (P2)

## Requisitos no funcionales
- Seguridad: RLS en toda tabla, bucket de fotos privado, secretos solo en variables de entorno, sin claves de servicio en el cliente.
- Rendimiento: la pantalla "mi semana" carga en menos de 2 s con conexión 4G.
- Compatibilidad: Chrome y Safari móviles recientes, y escritorio para el coach.
- Accesibilidad: contraste AA, objetivos táctiles de al menos 44 px.
- Costo: solo planes gratuitos (Vercel Hobby, Supabase Free).
- Idioma: español de Chile (tuteo). Todas las fechas y semanas se calculan en America/Santiago, sin importar dónde esté el alumno.
- Unidades: kilogramos.

## Casos límite
- Alumno entrena pasada la medianoche: el entrenamiento pertenece al día (hora de Santiago) en que lo inició.
- Alumno hace la misma sesión dos veces en la misma semana: se registra la primera como cumplimiento y la segunda como sesión extra, sin afectar la racha.
- Cambio de semana (lunes a domingo, hora de Santiago) con una sesión en curso: la sesión pertenece a la semana en que se inició.
- Coach que es su propio alumno: no debe verse a sí mismo duplicado en la lista de alumnos.
- Dos dispositivos con la misma sesión abierta: gana el último guardado y se avisa del conflicto.
- Programa sin sesiones en una semana (semana de descarga).
- Alumno sin programa activo: se muestra un estado vacío con indicación de hablar con su coach.
- Ejercicio archivado que sigue presente en un programa ya asignado: se mantiene visible en lo asignado.
- Series con peso cero (peso corporal): válidas si las repeticiones son mayores que cero.
- Invitación reutilizada o con correo ya registrado.
- Foto muy grande o formato no soportado (HEIC desde iPhone).
- Borrado de un alumno con comentarios y fotos asociados.

## Fuera de alcance
- Múltiples coaches, equipos o pagos y suscripciones.
- Registro público de alumnos.
- Modo offline completo (solo se protege la sesión en curso, ver RF-22 y RF-24).
- Sustituir ejercicios por el alumno.
- Prescripción por RPE/RIR, % del 1RM, tempo o superseries.
- Videos de técnica, chat en tiempo real, notificaciones push y por correo (salvo recuperación de contraseña).
- Aplicación nativa (la arquitectura debe permitirla después: lógica de dominio y API desacopladas de la UI).
- Importar datos de Iron Strength v1.
- Unidades en libras e inglés.

## Criterios de finalización
- Todos los RF del MVP del miércoles 14 (ver "Decisiones de clarificación") con al menos un test (unitario, de RLS o E2E) en verde. Los RF de Fase 2 y los P2 son opcionales.
- Tests de RLS prueban que el alumno A no puede leer ni escribir datos del alumno B ni del coach, y que un usuario sin sesión no accede a nada.
- E2E del flujo: invitar → registrarse → asignar programa → ejecutar sesión → coach ve el progreso y comenta.
- Despliegue en producción funcionando, con las dos cuentas de alumno reales.
- Lint, tipos y build en verde.

## Decisiones de clarificación (defaults aprobados el 2026-10-07; ver clarification.md)
Son requisitos con el mismo peso que los RF. Cada uno indica el hallazgo que cierra.

**MVP del miércoles 14 (C5).** Entra: todo P0, más medidas, fotos, comentarios por sesión, récords, racha, gráficos por ejercicio, progresión sugerida (RF-15b), edición de entrenamientos (RF-26b) y restablecimiento de contraseña por el coach (RF-7). **Fase 2** (pasan a la semana siguiente si falta tiempo): RF-27 temporizador, RF-31 logros, RF-32 resumen semanal, RF-37 comentarios no leídos, RF-45 PWA instalable, RF-47 exportar CSV y RF-48 borrar cuenta.

**Cuentas (C6, C7, C8, C17, C22)**
- DC-1: La cuenta del coach se crea una sola vez con un script de configuración inicial (no desde la app). El registro público está deshabilitado en Supabase Auth.
- DC-2: Cada invitación está atada a un correo. Solo ese correo puede usarla. Una invitación para un correo ya registrado se rechaza al crearla.
- DC-3: No se exige verificación de correo (el alta es por invitación). No se envían correos automáticos de la app.
- DC-4: Desactivar un alumno es reversible (el coach puede reactivarlo). El coach no borra alumnos en el MVP. Al borrar su cuenta (Fase 2) un alumno pierde sus datos, fotos y los comentarios de sus entrenamientos. La cuenta del coach no se borra desde la app.
- DC-5: La invitación se valida mediante una función de base de datos que solo responde "válida o no" sin exponer la tabla. Ningún usuario puede cambiar su propio rol. Las fotos se guardan bajo la carpeta de su dueño y las políticas de almacenamiento lo imponen. Toda función con privilegios elevados fija su `search_path` y tiene test.

**Entrenamientos (C9, C10, C11, C18, C19)**
- DC-6: Cada serie tiene un indicador de calentamiento. Las series de calentamiento se guardan pero no cuentan para volumen, récords ni progresión.
- DC-7: Un récord se calcula por ejercicio y puede ser de dos tipos: **mayor peso levantado** (con al menos 1 repetición) y **mejor 1RM estimado** (fórmula de Epley). El primer registro de un ejercicio no se celebra como récord. Solo cuentan series no calentamiento.
- DC-8: Cada entrenamiento recibe un identificador generado en el dispositivo al iniciarlo. Guardar dos veces el mismo identificador no duplica el entrenamiento. Si dos dispositivos terminan la misma sesión, se conserva el primero que llegó y se avisa en el segundo.
- DC-9: Los campos de cada serie arrancan con el peso prescrito; si no hay, con el último peso usado en ese ejercicio en cualquier programa. La referencia "última vez" muestra el último entrenamiento de ese ejercicio en cualquier programa. La sugerencia de progresión (RF-15b) se muestra aparte.

**Programas (C12, C13, C26, C27)**
- DC-10: Al asignar un programa nuevo, el activo pasa a archivado cuando empieza el nuevo. La fecha de inicio no puede ser anterior al lunes de la semana actual. Se permite dejar un programa programado a futuro; el programa activo es el que corresponde según la fecha.
- DC-11: Una semana sin sesiones planificadas (descarga) no suma ni rompe la racha. Una semana sin programa activo tampoco: la racha queda congelada. Una semana con sesiones planificadas cuenta si todas fueron cumplidas.
- DC-12: Los ejercicios del catálogo base son globales y de solo lectura. El coach crea y archiva solo los propios.
- DC-13: Límites de validación: series por ejercicio 1 a 10, repeticiones 1 a 100, mínimo ≤ máximo, peso objetivo de 0 a 500 kg, hasta 15 ejercicios por sesión planificada y hasta 7 sesiones por semana.

**Comentarios y medidas (C14, C15, C20, C21)**
- DC-14: Un comentario es texto de hasta 500 caracteres. Su autor puede borrarlo, no editarlo. En el MVP no hay marca de no leído (RF-37 es Fase 2); la lista de alumnos del coach muestra la fecha del último comentario.
- DC-15: Todos los campos de una medida son opcionales, pero hace falta al menos uno. Peso en kg (20 a 300) y cintura, pecho y brazo en cm (10 a 250). Hay un registro por fecha: guardar de nuevo el mismo día reemplaza el anterior tras confirmar. El alumno puede editar y borrar sus medidas.
- DC-16: Volumen = suma de peso × repeticiones de las series no calentamiento (un ejercicio de peso corporal cuenta solo repeticiones). El gráfico por ejercicio muestra el mejor 1RM estimado por entrenamiento, con el volumen como vista secundaria. El resumen semanal (Fase 2) se calcula al abrirlo, con la semana anterior completa y la actual parcial.
- DC-17: Catálogo de logros inicial (Fase 2): primera sesión, 10, 25 y 50 sesiones, 4 semanas seguidas y primer récord. Los logros son permanentes.

**Fotos (C16)**
- DC-18: Máximo 1 MB por foto tras reducirla en el dispositivo (lado mayor 1280 px, JPEG o WebP). Hasta 3 fotos por fecha, con etiqueta opcional (frente, lado, espalda). El enlace firmado dura 5 minutos. Los HEIC se convierten en el dispositivo; si falla, se muestra un mensaje pidiendo otro formato.

**Transversales (C23, C28, C29, C30)**
- DC-19: Los identificadores RF-n son estables y no se renumeran, aunque haya sufijos (RF-15b, RF-26b) u orden alterado.
- DC-20: Toda pantalla que consulta datos muestra "cargando" hasta 10 segundos; pasado ese tiempo muestra un error con botón de reintentar.
- DC-21: El presupuesto de rendimiento aplica a "mi semana" con un programa de hasta 16 semanas y hasta 200 entrenamientos. La región de la base se elegirá lo más cercana a Chile posible (São Paulo).
- DC-22: El coach tiene una sección "Mi entrenamiento" separada, con la misma experiencia que un alumno. No aparece en su lista de alumnos.

## Dudas abiertas
Resueltas: D1 (progresión automática, RF-15b), D2 (sesiones libres dentro de la semana), D5 (el coach también entrena, RF-49), D6 (cuenta nueva de Supabase solo para este proyecto, ver D9), D8 (doble progresión; incremento 2,5 kg en barra y 1 a 2 kg en mancuernas o máquinas; los detalles pendientes están en clarification.md C2).
Aceptadas por defecto (propuesta no objetada, se pueden reabrir): D3 (resumen semanal solo en la app), D4 (foto de hasta 1 MB tras reducirla), D7 (los P1 menores RF-27, 31, 37 y 45 pueden pasar a la semana siguiente).

Los 30 hallazgos de `clarification.md` están cerrados (ver "Decisiones de clarificación").

- [NECESITA ACLARACIÓN] D9: El proyecto de Supabase (ref `hmkgxhszamktvisrifxv`) está en una cuenta distinta a la conectada a esta herramienta. Hay que conectar esa cuenta o usar la CLI de Supabase con login del usuario. Además, confirmar su región (se prefiere São Paulo).
