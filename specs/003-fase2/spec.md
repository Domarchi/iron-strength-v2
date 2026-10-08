# Spec 003 — Fase 2: logros, resumen semanal, no leídos, exportar y borrar cuenta

Estado: aprobada el 2026-10-08 ("sigue con la fase 2"). Redefine RF-31, RF-32, RF-37, RF-47 y RF-48 de `specs/001-mvp/spec.md` (mantienen sus números) y agrega RF-64 a RF-67. Las decisiones que la 001 dejó abiertas (DC-4, DC-14, DC-16, DC-17) se cierran aquí con los defaults de abajo; se pueden reabrir.

## 1. Requisitos (EARS)

### Logros (RF-31, RF-65, RF-66)

- **RF-31**: CUANDO el alumno guarda un entrenamiento y con él alcanza un hito del catálogo, EL SISTEMA le otorga el logro. El catálogo inicial (DC-17) es: primer entrenamiento, 10, 25 y 50 entrenamientos, 4 semanas seguidas de racha y primer récord personal. Un entrenamiento cuenta si guardó al menos una serie.
- **RF-65**: CUANDO el guardado de un entrenamiento otorga logros nuevos, EL SISTEMA los anuncia en la pantalla de resultado del entrenamiento ("¡Entrenamiento guardado!"). Cada logro se anuncia una sola vez.
- **RF-66**: EL SISTEMA muestra los logros del alumno (obtenidos con su fecha y los pendientes con su condición) en Progreso, y al coach en el detalle de cada alumno. Los logros son permanentes: borrar o editar un entrenamiento después no los quita.

### Resumen semanal (RF-32)

- **RF-32**: EL SISTEMA muestra una pantalla "Resumen semanal" con la semana anterior completa y la semana en curso (parcial), y para cada una: sesiones cumplidas frente a las planificadas, entrenamientos totales, récords personales logrados, volumen total y su variación frente a la semana inmediatamente anterior. Se calcula al abrirla (DC-16). Se llega desde "Mi semana". SI una semana no tiene programa o no tiene entrenamientos, ENTONCES lo dice en lugar de mostrar ceros engañosos.

### Comentarios no leídos (RF-37)

- **RF-37**: EL SISTEMA marca como no leído un comentario escrito por la otra parte (coach ↔ alumno) hasta que el destinatario abre ese entrenamiento. Muestra una marca en la lista de entrenamientos (alumno y coach) y un contador en la lista de alumnos del coach y en la navegación (pestañas Historial y Alumnos). Un comentario propio nunca cuenta como no leído.

### Exportar (RF-47)

- **RF-47**: EL SISTEMA permite descargar el historial de entrenamientos de un alumno en CSV, al propio alumno y a su coach. Una fila por serie con: fecha, sesión, ejercicio, serie, tipo (trabajo o calentamiento), kg y repeticiones. SI quien pide no puede ver ese alumno, ENTONCES responde "no encontrado" sin revelar que existe.
- **RF-67**: EL SISTEMA neutraliza en el CSV los textos que Excel interpretaría como fórmula (que empiezan con `=`, `+`, `-` o `@`) y entrega el archivo en UTF-8 con marca de orden de bytes, separador `;` y decimales con coma, para que se abra bien en Excel configurado en español de Chile (DC-31).

### Cuenta (RF-48, RF-64)

- **RF-64**: EL SISTEMA ofrece una pantalla "Mi cuenta" desde el encabezado con nombre, correo y rol, la exportación del propio historial (RF-47), el cierre de sesión y, solo para alumnos, el borrado de cuenta.
- **RF-48**: CUANDO el alumno confirma el borrado de su cuenta escribiendo la palabra BORRAR, EL SISTEMA elimina sus fotos, medidas, entrenamientos, programas asignados, comentarios de sus entrenamientos y su usuario, cierra su sesión y vuelve al inicio de sesión con un aviso. SI no se pueden borrar las fotos, ENTONCES no borra la cuenta y lo informa para reintentar. La cuenta del coach no se puede borrar desde la app (DC-4).

## 2. Decisiones

- **DC-28 (logros almacenados):** se guardan en la tabla `achievements` (`student_id`, `kind`, `earned_at`, única por alumno y tipo). El alumno inserta solo las suyas y de un tipo del catálogo; el coach las lee; nadie actualiza ni borra (salvo la cascada al borrar la cuenta). Limitación aceptada: un alumno que llame a la API a mano podría autoasignarse un logro; es un dato cosmético sin efecto sobre nada más, y se documenta en la revisión de seguridad.
- **DC-29 (resumen):** semanas lunes–domingo en America/Santiago. El volumen es el de DC-16 (peso × repeticiones sin calentamientos; el peso corporal cuenta solo repeticiones y se muestra aparte). Los récords se detectan con las mismas reglas de RF-28 contra todo el historial anterior a cada entrenamiento.
- **DC-30 (no leídos):** tabla `comment_reads` (`user_id`, `workout_id`, `read_at`). Se marca leído al abrir el entrenamiento. Una función SQL con los permisos de quien llama (`unread_comments`) devuelve los conteos, de modo que la RLS de comentarios sigue siendo la única barrera. Los comentarios anteriores a esta función quedan como no leídos la primera vez.
- **DC-31 (CSV):** se eligió el formato de Excel en español de Chile (`;` y coma decimal) sobre el RFC 4180 estricto, porque los dos usuarios reales abren el archivo en Excel. Los nombres de ejercicio los define el coach, por eso RF-67 neutraliza fórmulas.
- **DC-32 (borrar cuenta sin service role):** una función SQL `delete_my_account()` con `security definer`, `search_path` fijado, solo para alumnos, borra el usuario de autenticación de quien llama y la cascada elimina el resto. Los archivos de fotos se borran antes con la sesión del propio alumno (la política de Storage lo permite) porque borrar filas no borra los archivos. Así `src/lib/supabase/admin.ts` sigue usándose solo en los tres puntos de siempre.
- **DC-33:** confirmar con la palabra BORRAR (sin distinguir mayúsculas) en lugar de la contraseña: el alumno inició sesión hace poco o tiene la sesión abierta en su propio móvil, y no se manejan contraseñas en esta pantalla.

## 3. Fuera de alcance

- Notificaciones push o por correo de comentarios, logros o resumen (el aviso es dentro de la app).
- Recuperar una cuenta borrada.
- Exportar fotos o medidas en el CSV.
- Compartir el resumen semanal fuera de la app.
- Logros personalizados por el coach.

## 4. Criterios de finalización

1. Terminar el primer entrenamiento muestra el logro "Primer entrenamiento" y aparece en Progreso y en la ficha del alumno para el coach.
2. El resumen semanal de un alumno con datos conocidos muestra las cifras esperadas.
3. Un comentario del coach aparece como no leído para el alumno (marca y contador) y deja de serlo al abrir el entrenamiento.
4. El CSV de un alumno se descarga para él y su coach, y otro alumno recibe "no encontrado".
5. Borrar la cuenta elimina datos y fotos, y el correo ya no puede iniciar sesión.
6. `npm run check`, pgTAP, integración, E2E (incluida accesibilidad AA) y CI en verde.
