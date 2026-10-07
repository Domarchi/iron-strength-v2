# Clarificación — Spec 001 (revisión QA)

Fase SDD: solo detectar. Ningún hallazgo está resuelto aquí; cada uno termina como decisión en la spec.
Severidad: **B** = bloquea el plan (cambia el modelo de datos o un requisito), **I** = importante (hay que decidirlo antes de implementar el requisito), **M** = menor (se puede decidir durante el plan).

## Estado

Todos cerrados. C1 a C4, C24, C25 y el glosario se resolvieron con el usuario; C5 con su aprobación de la lista de MVP; el resto con defaults aprobados (DC-1 a DC-22 en la spec).

| Hallazgo | Cierre                        |
| -------- | ----------------------------- |
| C5       | MVP del miércoles 14 y Fase 2 |
| C6       | DC-1, DC-2                    |
| C7       | DC-3, RF-7                    |
| C8       | RF-6                          |
| C9       | RF-26, RF-26b                 |
| C10      | DC-6                          |
| C11      | DC-7                          |
| C12      | DC-10                         |
| C13      | DC-11                         |
| C14      | DC-14                         |
| C15      | DC-15                         |
| C16      | DC-18                         |
| C17      | DC-4                          |
| C18      | DC-8                          |
| C19      | DC-9                          |
| C20      | DC-16                         |
| C21      | DC-17                         |
| C22      | DC-5                          |
| C23      | DC-19                         |
| C26      | DC-12                         |
| C27      | DC-13                         |
| C28      | DC-20                         |
| C29      | DC-21                         |
| C30      | DC-22                         |

## Glosario faltante (I)

G1. "Sesión" se usa con dos significados: la sesión **planificada** (A, B, C de una semana) y la sesión **realizada** (el entrenamiento registrado). Hay que fijar dos términos y usarlos en toda la spec. Afecta a RF-13, 19, 23, 29, 33, 36.

## Bloqueantes

C1 (B). **"Sesión cumplida" no está definida.** La racha (RF-29), el cumplimiento semanal (RF-33), el resumen (RF-32) y los logros (RF-31) dependen de ella. ¿Cuenta con 1 serie completada, con un porcentaje, o con todas las series prescritas? RF-23 guarda "solo series completadas", así que una sesión abandonada a la mitad puede existir.

C2 (B). **La progresión automática (RF-15b) tiene huecos que cambian el modelo de datos.**

- El peso objetivo es opcional (RF-14), pero la regla se evalúa "con el peso objetivo". Sin peso objetivo, la regla no se puede aplicar.
- No se dice si la sugerencia es una **prescripción nueva** (se guarda en el programa del alumno) o solo una **referencia visual**. Si la semana siguiente ya tiene un peso escrito por el coach, ¿cuál manda?
- No se dice qué pasa si el alumno levantó más peso que el objetivo, si falló repeticiones, o si el rango es fijo (mínimo = máximo).
- "Incremento configurable por ejercicio" no aparece en RF-14 (qué campos tiene la prescripción) ni se dice quién lo configura. D8 propuso 2,5 kg en barra y 1 a 2 kg en mancuernas o máquinas, pero la spec solo recoge 2,5 kg por defecto.
- No está decidido si el coach puede desactivar la progresión por ejercicio (se preguntó en D8, la respuesta no lo menciona).
- Para ejercicios de peso corporal (peso 0) la regla no aplica o no está definida.

C3 (B). **El concepto de "semana" es ambiguo.** Los casos límite usan lunes a domingo en hora de Santiago, pero RF-16 asigna con "fecha de inicio". Si el programa empieza un miércoles, ¿la semana 1 dura 7 días desde esa fecha o es una semana parcial hasta el domingo? Afecta a RF-19, 25, 29, 32 y 33. También: ¿qué pasa al terminar la última semana (programa finalizado)?

C4 (B). **RF-17 y RF-35 exigen que el servidor sepa cuándo una sesión "inició", pero RF-22 y RF-23 solo guardan la sesión al finalizar** y el avance vive en el dispositivo. Con eso, "sesiones futuras no iniciadas" (RF-17) y "actividad apenas el alumno guarda" (RF-35) no se pueden cumplir como están escritos. Además, el coach pidió ver el progreso "en vivo": hay que definir si eso significa ver sesiones en curso o solo ver lo ya guardado al abrir la pantalla.

C5 (B). **El criterio de finalización contradice a D7.** Dice "todos los RF P0 y P1 con test" pero D7 acepta mover P1 de menor valor a la semana siguiente. Hace falta una definición explícita de qué es "MVP del miércoles 14" (lista cerrada de RF).

## Importantes

C6 (I). **Alta del coach (RF-4):** "se crea una sola vez por configuración inicial" no dice cómo. Tampoco si la invitación (RF-1, 2) está atada a un correo concreto o es un enlace genérico, lo que cambia el caso "correo ya registrado".

C7 (I). **Correo y Supabase gratis.** RF-7 (recuperar contraseña) necesita enviar correo. El servicio de correo integrado de Supabase tiene límites muy bajos y restricciones en el plan gratuito. Falta decidir si se exige verificación de correo y qué proveedor se usa, o si la recuperación la hace el coach restableciendo la contraseña a mano.

C8 (I). **RF-6 no es verificable:** "limita los intentos" no dice cuántos ni por cuánto tiempo.

C9 (I). **Edición e historial de sesiones realizadas:** la spec no dice si el alumno puede deshacer una serie marcada, agregar una serie extra, saltarse series o ejercicios, descartar una sesión en curso, o editar y borrar una sesión ya guardada (v1 sí permitía editar). RF-26 permite "ajustar peso y repeticiones de cada serie" pero no agregar o quitar series.

C10 (I). **Series de calentamiento:** no hay forma de distinguirlas. Si el alumno las registra, contaminan el volumen, los récords y la progresión.

C11 (I). **Definición de récord (RF-28):** "peso o repeticiones nunca antes alcanzados" es ambiguo. ¿Mayor peso con al menos N repeticiones, más repeticiones a un peso dado, 1RM estimado? Con cualquiera, la primera vez que se hace un ejercicio es récord trivialmente.

C12 (I). **Programa activo (RF-18):** no dice qué pasa con el programa anterior al asignar uno nuevo (archivar, reemplazar, programar para el futuro), ni si se permite una fecha de inicio pasada o futura.

C13 (I). **Racha (RF-29):** una semana de descarga sin sesiones cuenta como cumplida o rompe la racha. Tampoco se define la racha al terminar un programa o entre dos programas, ni en la primera semana parcial.

C14 (I). **Comentarios (RF-36, 37):** no se define si se pueden editar o borrar, ni su largo máximo. Sin correo ni push (fuera de alcance) y con RF-37 como candidato a postergar, no hay forma de que la otra parte se entere de un comentario sin abrir la app. Eso debilita el flujo de feedback que pediste.

C15 (I). **Medidas (RF-38):** no dice si todos los campos son opcionales, qué pasa con dos registros el mismo día (reemplazar o agregar), si se pueden editar o borrar, ni los rangos plausibles. Unidad de las medidas corporales: cm presumiblemente, sin declararlo.

C16 (I). **Fotos (RF-40 a 43):** falta el tamaño máximo concreto (D4 propone 1 MB), la duración del enlace firmado ("corta duración"), si hay tipos de foto (frente, lado, espalda), cuántas por fecha, y el manejo del formato HEIC de iPhone en navegadores que no lo decodifican.

C17 (I). **Desactivar y borrar alumnos (RF-8, 48):** el caso límite "borrado de un alumno con comentarios y fotos" no tiene requisito asociado; solo existe desactivar. No se define reactivar, ni qué pasa con los comentarios del coach si el alumno borra su cuenta, ni el borrado de la cuenta del propio coach.

C18 (I). **Idempotencia y conflictos (RF-24 y casos límite):** "gana el último guardado" no cubre el caso real: reintentar un guardado fallido o terminar la misma sesión en dos dispositivos puede **duplicar** la sesión realizada. Falta la regla de unicidad.

C19 (I). **RF-20 vs RF-15b:** la "última sesión del mismo ejercicio" como referencia y la sugerencia de progresión pueden mostrar valores distintos. No se dice cuál precarga los campos ni si la referencia cruza programas.

C20 (I). **Resumen semanal (RF-32) y gráficos (RF-30):** no se define cuándo se genera (al cerrar la semana o en vivo), ni qué es "volumen" (¿peso × repeticiones?, ¿cómo se trata el peso corporal?), ni si el gráfico es mejor serie o volumen ("o").

C21 (I). **Logros (RF-31):** la lista de hitos no está cerrada ("X sesiones"), por lo que no es verificable. Tampoco se dice si un logro, una vez dado, es permanente aunque se borre una sesión.

C22 (I). **RLS y accesos anónimos (RF-44):** la invitación debe poder validarse antes de iniciar sesión, lo que exige una excepción controlada. La spec no cubre que un usuario no pueda cambiar su propio rol, ni las políticas del almacenamiento de fotos, ni funciones de base de datos con privilegios elevados.

## Menores

C23 (M). **Prioridades incoherentes:** hay requisitos sin etiqueta propia (se hereda del encabezado), RF-15b y RF-49 rompen la numeración, y RF-49 aparece antes que RF-45. Conviene renumerar.

C24 (M). **Zona horaria:** una línea dice "America/Santiago" fija y otra "día local del alumno" (que puede viajar). Se contradicen.

C25 (M). **Historia H3** habla de "sesión de hoy" y el requisito de rendimiento también, pero RF-19 ya no es por día.

C26 (M). **RF-9 y RF-11:** no está claro si los ejercicios del catálogo base son filas compartidas o copias por coach, ni si el coach puede editar o archivar los base.

C27 (M). **RF-14:** faltan validaciones: máximo de series, mínimo ≤ máximo, peso ≥ 0, máximo de ejercicios por sesión.

C28 (M). **RF-46:** "nunca queda cargando indefinidamente" no es verificable sin un tiempo límite y un reintento.

C29 (M). **Rendimiento:** "menos de 2 s" no dice en qué pantalla exactamente, con qué volumen de datos, ni dónde se aloja la base respecto a Chile.

C30 (M). **Coach como alumno de sí mismo (RF-49):** no está claro si aparece en su propia lista de alumnos (RF-33) o en una vista aparte, ni cómo se indica a sí mismo el cumplimiento.

## Resumen

30 hallazgos: 5 bloqueantes, 17 importantes, 8 menores (más el glosario).
