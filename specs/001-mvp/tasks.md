# Tareas 001 — Iron Strength v2 (MVP coach + alumnos)

Entradas: `plan.md`, `spec.md`, `docs/constitution.md`.

## Reglas de trabajo

- Una tarea cada vez, en orden de dependencia. Cada tarea es de menos de 30 minutos.
- **Tests primero**: se escribe el test en rojo, se implementa, se pone en verde. En el esquema, cada tarea de test pgTAP va justo antes de la política o función que prueba.
- Una tarea termina cuando se cumple su "Hecho cuando" y `npm run check` (lint + tipos + tests + build) está en verde. Después se marca y se hace un commit.
- Mensaje de commit: `Tn: <título>`. Cambios de comportamiento actualizan la spec en el mismo commit (constitución 10).
- `(tú)` = requiere una acción tuya en tu terminal o en un panel; yo no manejo tus credenciales.
- Las tareas de M3 solo dependen de M0 y se pueden hacer en cualquier momento después de T8.

Leyenda: `Dep` = dependencia · `RF` = requisitos que cubre.

---

## M0 — Scaffold (Mié 7)

- [x] **T1 · Crear app Next.js** — Dep: — · Next.js (App Router) + TypeScript estricto + Tailwind + ESLint en la raíz, con `src/`. **Hecho cuando:** `npm run dev` sirve la página inicial y `npm run build` pasa.
- [x] **T2 · shadcn/ui y tema** — Dep: T1 · Inicializar shadcn/ui, colores de marca (paleta ember de v1 como referencia), modo claro/oscuro, componente `Button`. **Hecho cuando:** una página de prueba muestra el botón en ambos modos y `build` pasa.
- [x] **T3 · Vitest** — Dep: T1 · Configurar Vitest (entorno node, alias `@/`) con un test trivial. **Hecho cuando:** `npm test` pasa.
- [x] **T4 · Scripts de calidad** — Dep: T3 · Scripts `lint`, `typecheck`, `test`, `build` y `check` (los encadena); Prettier. **Hecho cuando:** `npm run check` pasa en limpio.
- [x] **T5 · Supabase CLI local** — Dep: T1 · Instalar `supabase` como dependencia de desarrollo, `supabase init`, `config.toml` con registro público deshabilitado y zona horaria declarada. **Hecho cuando:** `npx supabase start` levanta el stack local y `npx supabase status` lista URL y claves.
- [x] **T6 · Clientes de Supabase** — Dep: T5 · `.env.example`; `src/lib/supabase/{server,client,admin}.ts` (`@supabase/ssr`), con `admin.ts` marcado `server-only`. **Hecho cuando:** `typecheck` pasa y importar `admin` desde un Client Component falla el build.
- [x] **T7 · AGENTS.md, CLAUDE.md, README** — Dep: T4 · AGENTS.md con comandos y reglas (plantilla del curso), CLAUDE.md que apunta a `@AGENTS.md`, README con cómo levantar el proyecto. **Hecho cuando:** un tercero podría clonar y seguir el README hasta `npm run dev`.
- [x] **T8 · CI básica** — Dep: T4 · GitHub Actions: instalar, lint, tipos, test, build. **Hecho cuando:** el workflow está verde en GitHub.

---

## M1 — Base de datos y RLS (Jue 8)

Esquema (una migración por tarea):

- [x] **T9 · Migración: profiles** — Dep: T5 · Extensiones (`btree_gist`), enum de rol, tabla `profiles`, índice único de un solo coach, trigger que impide cambiar `role`, `coach_id` e `is_active` a quien no sea el coach. RF: 4, 8, 44. **Hecho cuando:** `npx supabase db reset` aplica sin errores.
- [x] **T10 · Migración: invitations y login_attempts** — Dep: T9 · RF: 1, 2, 6; DC-2. **Hecho cuando:** `db reset` pasa y el token se guarda solo como hash (columna `token_hash`, sin columna de token).
- [x] **T11 · Migración: exercises** — Dep: T9 · Incluye `progression_increment_kg`, `archived_at` y unicidad de nombre por coach sin distinguir mayúsculas. RF: 9–11; DC-12. **Hecho cuando:** `db reset` pasa.
- [x] **T12 · Migración: programs** — Dep: T11 · `start_date` debe ser lunes, `weeks_count` 1–16, exclusión de solapamiento por alumno. RF: 12, 16, 18; DC-10. **Hecho cuando:** `db reset` pasa y un `insert` de dos programas solapados del mismo alumno falla en una prueba manual.
- [x] **T13 · Migración: program_sessions y session_exercises** — Dep: T12 · Límites de DC-13 como `check`. RF: 13, 14. **Hecho cuando:** `db reset` pasa y un `insert` con `reps_min > reps_max` falla.
- [x] **T14 · Migración: workouts y workout_sets** — Dep: T13 · `id` sin default (lo da el cliente), `student_id` desnormalizado en series, índices del plan. RF: 20–24; DC-6, 8. **Hecho cuando:** `db reset` pasa y reinsertar el mismo `id` falla por clave duplicada.
- [x] **T15 · Migración: comments y body_measurements** — Dep: T14 · RF: 36, 38; DC-14, 15. **Hecho cuando:** `db reset` pasa; una medida con todos los campos nulos falla.
- [x] **T16 · Migración: progress_photos** — Dep: T9 · Trigger de máximo 3 por fecha. RF: 40; DC-18. **Hecho cuando:** `db reset` pasa; la cuarta foto de una fecha falla.
- [x] **T17 · Funciones auxiliares** — Dep: T9 · `is_coach_of(uuid)` y `current_coach_id()` como `security definer stable` con `search_path` fijo. RF: 44. **Hecho cuando:** `db reset` pasa y las funciones existen en el esquema.

RLS (test antes de política):

- [x] **T18 · Fixtures pgTAP** — Dep: T17 · Helper SQL para crear y asumir usuarios de prueba: coach, alumno A, alumno B, anónimo. **Hecho cuando:** `npx supabase test db` ejecuta un test de humo con los tres usuarios.
- [x] **T19 · Test: RLS de profiles y exercises** — Dep: T18 · Alumno ve solo lo suyo y los ejercicios globales y de su coach; coach ve a sus alumnos; nadie cambia su propio rol; alumno no escribe ejercicios. **Hecho cuando:** el test existe y falla (rojo).
- [x] **T20 · RLS: profiles y exercises** — Dep: T19 · **Hecho cuando:** T19 en verde.
- [x] **T21 · Test: RLS de programas** — Dep: T20 · Alumno solo lee los suyos y no escribe; coach CRUD de los suyos; alumno B no ve los de A. **Hecho cuando:** existe y falla.
- [x] **T22 · RLS: programs, program_sessions, session_exercises** — Dep: T21 · **Hecho cuando:** T21 en verde.
- [x] **T23 · Test: RLS de entrenamientos** — Dep: T22 · Insert y select propios; coach lee los de sus alumnos; alumno B no lee los de A; edición y borrado solo dentro de 7 días (probar el día 7 y el día 8). **Hecho cuando:** existe y falla.
- [x] **T24 · RLS: workouts y workout_sets** — Dep: T23 · **Hecho cuando:** T23 en verde.
- [x] **T25 · Test: RLS de comments, mediciones, fotos, invitaciones y login_attempts** — Dep: T24 · Comentarios solo si se ve el entrenamiento y solo borrar el propio; `login_attempts` e `invitations` inaccesibles para alumnos. **Hecho cuando:** existe y falla.
- [x] **T26 · RLS: esas tablas** — Dep: T25 · **Hecho cuando:** T25 en verde.
- [x] **T27 · Test: Storage de fotos** — Dep: T26 · Alumno lee y escribe solo en su carpeta; coach lee la de sus alumnos; alumno B no accede; anónimo no accede. **Hecho cuando:** existe y falla.
- [x] **T28 · Bucket privado y políticas** — Dep: T27 · Tipos JPEG/WebP y 1 MB. **Hecho cuando:** T27 en verde.
- [x] **T29 · Test: validate_invitation** — Dep: T26 · Devuelve solo `valida`, `vencida` o `usada`; anónimo no puede hacer `select` sobre `invitations`. **Hecho cuando:** existe y falla.
- [x] **T30 · Función validate_invitation** — Dep: T29 · **Hecho cuando:** T29 en verde.
- [ ] **T31 · Test: assign_program** — Dep: T26 · Solo el coach del alumno puede asignar; ajusta al lunes; copia profunda sin compartir filas con la plantilla; recorta el programa vigente; es atómica ante error. **Hecho cuando:** existe y falla.
- [ ] **T32 · Función assign_program** — Dep: T31 · RF: 16, 18; DC-10. **Hecho cuando:** T31 en verde.

Datos y cierre de fase:

- [ ] **T33 · Convertir catálogo de v1** — Dep: T11 · Script único que lee `~/Developer/iron-strength/src/data/exercises.js` y genera `supabase/seed.sql` (grupo muscular y equipamiento mapeados; incremento por defecto según equipamiento). RF: 9. **Hecho cuando:** el SQL generado se revisa a mano en una muestra de 10 ejercicios.
- [ ] **T34 · Cargar seed y verificar** — Dep: T33 · **Hecho cuando:** `db reset` carga el catálogo y una consulta cuenta lo mismo que `exercises.js`; sin duplicados.
- [ ] **T35 · Tipos TS y CI de base de datos** — Dep: T32, T34, T8 · Script `db:types` (`supabase gen types`) y job de CI con `supabase start` + `supabase test db`. **Hecho cuando:** `typecheck` usa los tipos generados y el job de CI está verde.
- [ ] **T36 · Aplicar migraciones al proyecto remoto** — (tú) Dep: T35 · Tú ejecutas `npx supabase login`, `npx supabase link --project-ref hmkgxhszamktvisrifxv` y `npx supabase db push`. **Hecho cuando:** `npx supabase migration list` muestra todas aplicadas en local y remoto, y confirmas la región del proyecto (D9).

---

## M2 — Autenticación e invitaciones (Vie 9)

- [ ] **T37 · Script de alta del coach** — Dep: T35 · `scripts/create-coach.ts` con service role; pide correo y contraseña por entorno (no por chat). DC-1. **Hecho cuando:** ejecutarlo en local crea el coach y repetirlo falla con mensaje claro (un solo coach).
- [ ] **T38 · Límite de intentos de login** — Dep: T35 · `lib/auth/rate-limit.ts` con tests unitarios primero: 5 fallos en 15 minutos bloquean 15 minutos, éxito reinicia el contador. RF: 6. **Hecho cuando:** los tests pasan, incluida la ventana de tiempo con reloj simulado.
- [ ] **T39 · Login** — Dep: T38, T6 · Server action y página `/login` con error genérico y aviso de bloqueo. RF: 5, 6. **Hecho cuando:** en local se puede iniciar sesión con el coach, un error muestra el mismo mensaje con correo inexistente o contraseña errónea.
- [ ] **T40 · Middleware de sesión y roles** — Dep: T39 · Refresco de sesión, redirección por rol, ruta `/coach/**` solo coach, bloqueo de usuarios desactivados. RF: 5, 8, 44. **Hecho cuando:** un test de integración confirma que sin sesión redirige a `/login` y que un alumno no entra a `/coach`.
- [ ] **T41 · Layout de la aplicación** — Dep: T40, T2 · Navegación móvil primero por rol y botón de cerrar sesión. **Hecho cuando:** cerrar sesión limpia la cookie y devuelve a `/login`.
- [ ] **T42 · Crear invitación** — Dep: T41 · Acción del coach (correo → token aleatorio, hash guardado, enlace mostrado una sola vez, vence en 7 días) y listado de invitaciones. RF: 1; DC-2. **Hecho cuando:** crear dos invitaciones al mismo correo vigente falla y el enlace se copia desde la pantalla.
- [ ] **T43 · Registro por invitación** — Dep: T42, T30 · Página `/invite/[token]` y route handler que valida, crea el usuario con `auth.admin`, inserta el perfil y marca la invitación usada. RF: 2, 3, 4; DC-5. **Hecho cuando:** un alumno se registra con un enlace válido y queda con sesión abierta.
- [ ] **T44 · Tests de integración del registro** — Dep: T43 · Enlace vencido, usado, inexistente, correo distinto al invitado y correo ya registrado. RF: 3. **Hecho cuando:** los cinco casos pasan y ninguno deja un usuario a medias.
- [ ] **T45 · Restablecimiento: acción del coach** — Dep: T41 · Genera enlace de recuperación (24 h) tras verificar `is_coach_of`. RF: 7. **Hecho cuando:** un coach no puede generar enlace para un alumno ajeno (test) y el enlace se muestra una sola vez.
- [ ] **T46 · Restablecimiento: página del alumno** — Dep: T45 · `/reset/[token]` verifica el enlace y fija la contraseña nueva (mínimo 8). RF: 6, 7. **Hecho cuando:** el alumno cambia su contraseña y la anterior deja de funcionar.
- [ ] **T47 · Activar y desactivar alumno** — Dep: T40 · Acción del coach y efecto inmediato en middleware. RF: 8; DC-4. **Hecho cuando:** un alumno desactivado no puede iniciar sesión ni usar una sesión abierta; al reactivarlo vuelve a entrar.
- [ ] **T48 · Test de integración del bloqueo** — Dep: T39 · 5 intentos fallidos bloquean, un sexto con la contraseña correcta sigue bloqueado, pasados 15 minutos entra. RF: 6. **Hecho cuando:** pasa con reloj simulado.

---

## M3 — Lógica de dominio pura (Vie 9 – Sáb 10; solo depende de M0)

- [ ] **T49 · weeks: lunes y zona horaria** — Dep: T3 · `mondayOf`, `weekStart`, `todayInSantiago` con `Intl`; tests con las transiciones de horario de Chile y la medianoche. RF: 16, 19; DC-11. **Hecho cuando:** los tests de las fechas de cambio de hora pasan.
- [ ] **T50 · weeks: semana del programa** — Dep: T49 · `programWeekNumber`, `programState` (programado, activo, terminado). **Hecho cuando:** los tests cubren primera semana, última semana, fecha anterior y posterior al programa.
- [ ] **T51 · schemas (zod)** — Dep: T3 · Límites de DC-13, DC-15 y DC-18 (series, reps, pesos, medidas, foto). **Hecho cuando:** cada límite tiene un test de borde válido y uno inválido.
- [ ] **T52 · completion** — Dep: T50 · Sesión cumplida, entrenamiento extra, estado de cada sesión planificada (hecha, pendiente, no realizada) y cumplimiento semanal. RF: 19, 25, 33; DC-11. **Hecho cuando:** los tests cubren: 0 series, doble entrenamiento de la misma sesión, semana pasada incompleta y semana de descarga.
- [ ] **T53 · streak** — Dep: T52 · Racha en semanas con descarga neutra, semanas sin programa congeladas y extras sin efecto. RF: 29; DC-11. **Hecho cuando:** los tests cubren racha rota, mantenida, descarga y cambio de programa.
- [ ] **T54 · records** — Dep: T3 · Mayor peso, 1RM de Epley, primer registro sin celebrar, calentamiento excluido. RF: 28; DC-6, 7. **Hecho cuando:** los tests cubren empate de peso, primer registro, calentamiento y varios récords en una misma sesión.
- [ ] **T55 · progression** — Dep: T3 · Doble progresión con rango fijo, peso corporal, sin peso objetivo y rango incompleto. RF: 15b; DC-9. **Hecho cuando:** los tests cubren cada caso de RF-15b, incluidos los incrementos por equipamiento.
- [ ] **T56 · volume** — Dep: T3 · Volumen por entrenamiento y por semana, peso corporal cuenta solo repeticiones, tendencia contra la semana anterior. DC-16. **Hecho cuando:** los tests pasan, incluida la semana sin datos previos.
- [ ] **T57 · Revisión de cobertura del dominio** — Dep: T49–T56 · Informe de cobertura de `src/domain/`. **Hecho cuando:** todas las reglas DC-6 a DC-17 tienen al menos un test que las nombra y la cobertura de ramas del dominio es de 90% o más.

---

## M4 — Ejercicios y programas (Sáb 10 – Dom 11)

- [ ] **T58 · Biblioteca de ejercicios (lectura)** — Dep: T41, T34 · `/coach/exercises` con globales y propios, filtro por grupo muscular. RF: 9. **Hecho cuando:** se ve el catálogo del seed y los archivados no aparecen por defecto.
- [ ] **T59 · Crear, editar y archivar ejercicio propio** — Dep: T58, T51 · Formulario con incremento de progresión. RF: 10, 11; DC-12. **Hecho cuando:** un ejercicio propio aparece en la biblioteca, uno global no se puede editar, y uno usado en un historial se archiva en vez de borrarse.
- [ ] **T60 · Lista de programas y crear plantilla** — Dep: T41 · Nombre y semanas (1–16). RF: 12. **Hecho cuando:** crear una plantilla de 4 semanas la muestra en la lista; 17 semanas muestra error.
- [ ] **T61 · Editor: semanas y sesiones** — Dep: T60 · Agregar y quitar sesiones (A, B, C…) por semana, hasta 7. RF: 13; DC-13. **Hecho cuando:** una semana de descarga sin sesiones es válida y la octava sesión se rechaza.
- [ ] **T62 · Editor: agregar ejercicio con prescripción** — Dep: T61, T59 · Buscador de ejercicios y campos series, reps mín/máx, peso objetivo opcional y nota. RF: 14. **Hecho cuando:** los límites de T51 se muestran como errores de formulario y el ejercicio 16 se rechaza.
- [ ] **T63 · Editor: ordenar y quitar ejercicios** — Dep: T62 · Reordenar con `dnd-kit` y alternativa por botones para accesibilidad. RF: 13. **Hecho cuando:** el orden se conserva al recargar.
- [ ] **T64 · Copiar semana** — Dep: T62 · Acción que duplica sesiones y prescripciones de una semana a otra con confirmación si la destino tiene contenido. RF: 15. **Hecho cuando:** un test confirma copia profunda (editar la copia no cambia el origen).
- [ ] **T65 · Asignar programa a un alumno** — Dep: T64, T32 · Selector de alumno (incluido el propio coach) y fecha, usa `assign_program`. RF: 16, 18, 49; DC-10. **Hecho cuando:** asignar con fecha miércoles queda en el lunes siguiente o actual según la regla, y asignar un solapado recorta el vigente (test de integración).
- [ ] **T66 · Editar programa asignado** — Dep: T65 · Solo semanas posteriores a la semana en curso. RF: 17. **Hecho cuando:** una edición en la semana actual o pasada se rechaza en servidor y en pantalla.

---

## M5 — Mi semana y ejecución de sesión (Dom 11 – Lun 12)

- [ ] **T67 · Carga de datos de la semana** — Dep: T52, T65 · Función de servidor que trae programa vigente, sesiones de la semana y entrenamientos de esa semana. RF: 19. **Hecho cuando:** un test de integración devuelve los estados correctos para un alumno con 2 sesiones, una hecha.
- [ ] **T68 · Pantalla "Mi semana"** — Dep: T67 · Tarjetas de sesión con estado, y estados vacíos: sin programa, programa terminado, semana de descarga, todo cumplido. RF: 19, 46; DC-22. **Hecho cuando:** cada estado vacío se ve en una prueba manual con datos de ejemplo.
- [ ] **T69 · Borrador de entrenamiento** — Dep: T3 · `lib/draft.ts` (localStorage por usuario y entrenamiento, versionado, con tests con `jsdom` primero). RF: 22. **Hecho cuando:** los tests cubren guardar, restaurar, borrar y datos corruptos (se ignoran).
- [ ] **T70 · Ruta de sesión y precarga** — Dep: T68, T69 · `/workout/[plannedSessionId]`: ejercicios, series prescritas, peso precargado según DC-9 y referencia "última vez". RF: 20; DC-9. **Hecho cuando:** sin peso objetivo se precarga el último peso usado en cualquier programa.
- [ ] **T71 · Series: marcar y editar** — Dep: T70 · Marcar completa, ajustar peso y reps, desmarcar, serie extra, interruptor de calentamiento, saltar ejercicio. RF: 21, 26; DC-6. **Hecho cuando:** objetivos táctiles de al menos 44 px y el cambio se refleja en el borrador.
- [ ] **T72 · Sugerencia de progresión** — Dep: T71, T55 · Muestra la sugerencia aparte del valor prescrito. RF: 15b. **Hecho cuando:** se muestra solo si el último entrenamiento llegó al tope del rango.
- [ ] **T73 · Descartar y restaurar** — Dep: T71 · Descartar con confirmación; al refrescar o navegar se restaura el borrador. RF: 22, 26. **Hecho cuando:** recargar la página a mitad de una sesión conserva todas las series.
- [ ] **T74 · Acción `saveWorkout`** — Dep: T73, T24 · Validación zod, upsert idempotente por id, `performed_on` y `week_start` calculados en servidor, cero series no guarda. RF: 23; DC-8. **Hecho cuando:** enviar el mismo id dos veces deja un solo entrenamiento y cero series devuelve el aviso (test).
- [ ] **T75 · Finalizar con fallo de red** — Dep: T74 · Estado de guardado; si falla, se conserva el borrador, se avisa y se reintenta con botón y al volver `online`. RF: 24. **Hecho cuando:** cortar la red al finalizar no pierde datos y al restablecerla se guarda sin duplicar.
- [ ] **T76 · Pantalla de resultado** — Dep: T75 · Duración, volumen y series; el espacio para récords queda listo (T82). RF: 23. **Hecho cuando:** tras finalizar se muestra el resumen y la sesión aparece como hecha en "Mi semana".
- [ ] **T77 · Historial de entrenamientos** — Dep: T76 · Lista paginada y detalle. RF: 34. **Hecho cuando:** el detalle muestra series reales, calentamiento marcado y duración.
- [ ] **T78 · Editar y borrar un entrenamiento** — Dep: T77, T24 · Solo hasta 7 días después. RF: 26b. **Hecho cuando:** el botón no aparece al octavo día y el servidor rechaza el intento (test).
- [ ] **T79 · Test de integración de guardado** — Dep: T75 · Doble envío concurrente, id duplicado de otro alumno y sesión ajena. RF: 23, 44; DC-8. **Hecho cuando:** los tres casos pasan.

---

## M6 — Progreso (Lun 12)

- [ ] **T80 · Lista de ejercicios con progreso** — Dep: T77, T54 · `/progress` con mejor marca y último valor por ejercicio. RF: 30. **Hecho cuando:** solo aparecen ejercicios con entrenamientos y el estado vacío se ve sin datos.
- [ ] **T81 · Gráfico por ejercicio** — Dep: T80, T56 · 1RM estimado por entrenamiento con volumen como vista secundaria, carga diferida. RF: 30; DC-16. **Hecho cuando:** el gráfico se renderiza con 1 punto, con muchos puntos y sin puntos.
- [ ] **T82 · Récords** — Dep: T76, T54 · Destacar récords al terminar la sesión y listarlos en progreso. RF: 28; DC-7. **Hecho cuando:** el primer registro de un ejercicio no muestra celebración; una marca nueva sí.
- [ ] **T83 · Racha y calendario de constancia** — Dep: T53, T68 · En "Mi semana" y en progreso. RF: 29; DC-11. **Hecho cuando:** coincide con los casos de los tests de T53 usando datos de ejemplo.

---

## M7 — Panel del coach y comentarios (Mar 13)

- [ ] **T84 · Lista de alumnos del coach** — Dep: T52, T77 · Última actividad, cumplimiento de la semana y fecha del último comentario; no incluye al propio coach. RF: 33; DC-22. **Hecho cuando:** un alumno sin entrenamientos muestra "sin actividad" y el coach no aparece en su lista.
- [ ] **T85 · Detalle del alumno** — Dep: T84, T81, T83 · Historial, récords, racha y medidas, reutilizando los componentes del alumno. RF: 34, 35. **Hecho cuando:** un entrenamiento guardado por el alumno aparece al refrescar la pantalla del coach.
- [ ] **T86 · Comentarios por entrenamiento** — Dep: T77, T26 · Lista, formulario con 500 caracteres y borrar el propio, para ambos roles. RF: 36; DC-14. **Hecho cuando:** un comentario de 501 caracteres se rechaza y un alumno no puede borrar el del coach (test).
- [ ] **T87 · "Mi entrenamiento" del coach** — Dep: T68, T65 · Sección separada que reutiliza "Mi semana" y el historial. RF: 49; DC-22. **Hecho cuando:** el coach se asigna un programa y registra una sesión como cualquier alumno.
- [ ] **T88 · Programas del alumno en su detalle** — Dep: T85, T66 · Ver el activo, los programados y los archivados, con acceso al editor. RF: 17, 18. **Hecho cuando:** asignar un programa nuevo deja el anterior como archivado.

---

## M8 — Medidas y fotos (Mar 13)

- [ ] **T89 · Registrar medidas** — Dep: T41, T51 · Formulario con unidades, al menos un campo, un registro por fecha con confirmación para reemplazar. RF: 38; DC-15. **Hecho cuando:** un valor fuera de rango o un formulario vacío muestran error y reemplazar el mismo día pide confirmación.
- [ ] **T90 · Lista y gráfico de medidas** — Dep: T89 · Editar, borrar y gráfico de evolución, visible para el coach. RF: 38, 39. **Hecho cuando:** el coach ve las medidas del alumno y el alumno B no.
- [ ] **T91 · Procesamiento de imagen en el cliente** — Dep: T51 · Reducir a lado mayor 1280 px, WebP, hasta 1 MB, conversión HEIC con carga diferida; funciones de dimensiones y calidad con tests unitarios. RF: 40, 43; DC-18. **Hecho cuando:** los tests pasan y una imagen de 6 MB queda bajo 1 MB.
- [ ] **T92 · Subir foto** — Dep: T91, T28 · Selector con cámara o archivo, etiqueta opcional, subida a `{uid}/{uuid}.webp`, fila en la base y borrado del archivo si la fila falla. RF: 40, 43. **Hecho cuando:** un archivo que no es imagen se rechaza con mensaje claro y un fallo en la base no deja archivos huérfanos.
- [ ] **T93 · Galería y borrar foto** — Dep: T92 · URLs firmadas de 300 s, para alumno y coach; borrar elimina archivo y fila. RF: 41, 42. **Hecho cuando:** la URL deja de funcionar a los 5 minutos y tras borrar el archivo no existe.
- [ ] **T94 · Test de integración de fotos** — Dep: T93 · Cuarta foto del día, tipo inválido, tamaño excedido, acceso del coach y de otro alumno. RF: 40–43, 44. **Hecho cuando:** todos los casos pasan.

---

## M9 — Endurecimiento y despliegue (Mar 13 – Mié 14)

- [ ] **T95 · Carga, error y tiempo límite** — Dep: M5–M8 · `loading.tsx` y `error.tsx` por ruta, utilidad de tiempo límite de 10 s con botón de reintento. RF: 46; DC-20. **Hecho cuando:** simular una consulta lenta muestra el error con reintento tras 10 s.
- [ ] **T96 · Estados vacíos, copy y accesibilidad** — Dep: T95 · Revisar textos en español de Chile (tuteo), contraste AA, objetivos de 44 px y foco visible. **Hecho cuando:** revisión manual en móvil y una pasada con la skill `design:accessibility-review` sin hallazgos críticos.
- [ ] **T97 · Playwright y fixtures** — Dep: T35 · Configuración contra Supabase local, `db reset` entre suites y helper para crear el coach. **Hecho cuando:** un test de humo de login pasa.
- [ ] **T98 · E2E: flujo principal** — Dep: T97, M7 · Invitar → registrarse → asignar → ejecutar sesión → el coach ve el progreso y comenta. **Hecho cuando:** pasa de punta a punta (criterio de finalización de la spec).
- [ ] **T99 · E2E: fallo de guardado** — Dep: T98 · Cortar la red al finalizar, comprobar el aviso y el reintento sin duplicados. RF: 24. **Hecho cuando:** pasa.
- [ ] **T100 · E2E: seguridad** — Dep: T98 · Alumno sin acceso a `/coach`, a datos del otro alumno ni a fotos ajenas; usuario desactivado expulsado. RF: 8, 44. **Hecho cuando:** pasa.
- [ ] **T101 · E2E en CI** — Dep: T100 · Job que ejecuta los E2E en cada PR hacia `main`. **Hecho cuando:** el workflow completo (lint, tipos, unitarios, pgTAP, build, E2E) está verde.
- [ ] **T102 · Revisión de seguridad** — Dep: T101 · Buscar usos de `admin.ts` (solo los 3 previstos), secretos en el repo, cabeceras básicas, y ejecutar la skill `security-review`. **Hecho cuando:** sin hallazgos altos abiertos.
- [ ] **T103 · Despliegue** — (tú) Dep: T102, T36 · Crear el proyecto en Vercel, cargar variables de entorno, ejecutar `create-coach` contra producción con tus credenciales locales. **Hecho cuando:** la URL de producción abre `/login` y el coach inicia sesión.
- [ ] **T104 · Prueba en producción y alta de alumnos** — (tú) Dep: T103 · Humo en móvil real e invitaciones a los 2 alumnos. **Hecho cuando:** ambos alumnos tienen cuenta y registraron un entrenamiento.
- [ ] **T105 · Validación RF por RF** — Dep: T104 · `specs/001-mvp/validation.md` con cada RF del MVP, el test que lo cubre y su resultado. **Hecho cuando:** ningún RF del MVP queda sin test, y el veredicto final está escrito.
- [ ] **T106 · Documentación al día** — Dep: T105 · AGENTS.md y README reflejan el estado real. **Hecho cuando:** un tercero puede levantar el proyecto y desplegarlo solo con ellos.

---

## Fase 2 (fuera de estas tareas)

RF-27 temporizador de descanso, RF-31 logros, RF-32 resumen semanal, RF-37 comentarios no leídos, RF-45 PWA instalable, RF-47 exportar CSV, RF-48 borrar cuenta.

## Resumen

106 tareas. M0: 8 · M1: 28 · M2: 12 · M3: 9 · M4: 9 · M5: 13 · M6: 4 · M7: 5 · M8: 6 · M9: 12.
Acciones tuyas: T36, T103, T104.
