# Plan 001 — Iron Strength v2 (MVP coach + alumnos)

Entradas: `docs/constitution.md` y `specs/001-mvp/spec.md` (con DC-1 a DC-22). Este documento no tiene código de aplicación: define arquitectura, modelo de datos, seguridad, estructura y estrategia de tests, y qué RF cubre cada parte. Las tareas salen de aquí.

## 1. Arquitectura

```
Navegador (PWA ligera, móvil primero)
   │  React Server Components + Client Components
   ▼
Next.js (App Router, Vercel)           ← server actions / route handlers
   │  @supabase/ssr (cookies httpOnly)       │ service role: SOLO en el servidor
   ▼                                          ▼
Supabase: Auth · Postgres (RLS) · Storage privado (fotos)
```

- **Lecturas** en Server Components con el cliente de Supabase del usuario (RLS decide qué ve).
- **Escrituras** en Server Actions, con validación zod compartida y RLS como segunda barrera.
- **Service role** solo en tres puntos del servidor: registro por invitación, enlace de restablecimiento de contraseña (coach), y control de intentos de login. Nunca llega al cliente (constitución 4 y 8).
- **Lógica de dominio** en `src/domain/` (TypeScript puro, sin React ni red). Es lo que se reutilizará en una app nativa futura.
- **Entornos**: local (Supabase CLI en Docker) para desarrollar y testear; producción (proyecto `hmkgxhszamktvisrifxv`). Sin entorno intermedio, para mantener el costo en $0.

## 2. Decisiones técnicas (con la alternativa descartada)

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| T1 | Next.js App Router + TS estricto | Vite SPA | Auth por cookies y server actions simplifican la seguridad; un solo despliegue |
| T2 | `@supabase/ssr` con cookies | JWT propio como en v1 | La sesión y la RLS usan el mismo token; menos código de auth |
| T3 | Series en tabla `workout_sets` normalizada | JSONB dentro del entrenamiento (v1) | Récords, volumen y progresión se consultan por ejercicio; JSONB obliga a recorrerlo todo |
| T4 | Programa plantilla y programa asignado en la misma tabla (`student_id` nulo = plantilla); asignar = copia profunda | Tablas separadas | Mismo código de edición para ambos; el snapshot (RF-16) es una función SQL |
| T5 | El coach es su propio alumno (`coach_id = id`) | Rol aparte para entrenar | RF-49 sin código duplicado y RLS uniforme |
| T6 | Semanas, progresión, rachas y récords calculados en `domain/`, no guardados | Guardar rachas y contadores | Cero desincronización; con ≤200 entrenamientos el cálculo es barato |
| T7 | Borrador de la sesión en `localStorage` + guardado idempotente por id de cliente | Guardado parcial en servidor | RF-22/24/C4: sin tiempo real ni estado de servidor intermedio |
| T8 | Tailwind + shadcn/ui (Radix) | CSS propio como v1 | Accesibilidad (44 px, foco, contraste) ya resuelta; velocidad |
| T9 | Recharts para gráficos | uPlot, visx | Menos código para el plazo; se carga solo en pantallas de progreso (lazy) |
| T10 | Control de intentos de login en una tabla propia | Solo límites de Supabase Auth | RF-6 exige 5 intentos / 15 min por correo; el límite nativo es por IP y por hora |
| T11 | Migraciones SQL con la CLI de Supabase (`supabase/migrations`) | Cambios desde el panel | Constitución 7; reproducible localmente y en CI |
| T12 | Tests de RLS con pgTAP (`supabase test db`) | Tests solo desde la app | Prueban la política real contra Postgres, independiente de la UI |

## 3. Estructura del repositorio

```
.
├─ AGENTS.md  CLAUDE.md  README.md  .env.example
├─ docs/constitution.md
├─ specs/001-mvp/{spec,clarification,plan,tasks}.md
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/            # una migración por tarea de esquema
│  ├─ seed.sql               # catálogo base de ejercicios (migrado de v1)
│  └─ tests/                 # pgTAP: rls_*.sql, functions_*.sql
├─ scripts/create-coach.ts   # alta única del coach (DC-1)
├─ src/
│  ├─ domain/                # TS puro + tests unitarios (*.test.ts)
│  │  ├─ weeks.ts            # lunes-domingo en America/Santiago, semana del programa
│  │  ├─ completion.ts       # sesión cumplida, extras, cumplimiento semanal
│  │  ├─ streak.ts           # racha en semanas (DC-11)
│  │  ├─ records.ts          # peso máximo y 1RM Epley (DC-7)
│  │  ├─ progression.ts      # doble progresión sugerida (RF-15b)
│  │  ├─ volume.ts           # volumen y tendencia (DC-16)
│  │  └─ schemas.ts          # zod: límites de DC-13, DC-15, DC-18
│  ├─ lib/
│  │  ├─ supabase/{server,client,admin}.ts   # admin.ts solo importable desde servidor
│  │  ├─ auth/{session,rate-limit}.ts
│  │  ├─ draft.ts            # borrador de entrenamiento (localStorage)
│  │  └─ with-timeout.ts     # DC-20
│  ├─ app/
│  │  ├─ (auth)/login, invite/[token], reset/[token]
│  │  ├─ (app)/             # layout con guardia de sesión
│  │  │  ├─ week/            # mi semana (alumno y coach)
│  │  │  ├─ workout/[plannedSessionId]/
│  │  │  ├─ progress/  progress/[exerciseId]/
│  │  │  ├─ body/            # medidas y fotos
│  │  │  └─ coach/           # solo rol coach
│  │  │     ├─ students/ students/[id]/
│  │  │     ├─ programs/ programs/[id]/
│  │  │     └─ exercises/
│  │  └─ api/                # solo lo que no sea server action
│  ├─ components/            # ui/ (shadcn), workout/, program/, charts/
│  └─ middleware.ts          # refresco de sesión y redirección por rol
├─ e2e/                      # Playwright
└─ .github/workflows/ci.yml
```

## 4. Modelo de datos

Convenciones: `uuid` como PK; `created_at timestamptz default now()`; todas las tablas con RLS activada; fechas de calendario como `date` calculadas en America/Santiago; pesos `numeric(6,2)`.

| Tabla | Columnas principales | Restricciones |
|---|---|---|
| `profiles` | `id` (= `auth.users.id`), `role` (`coach`\|`student`), `full_name`, `coach_id` → profiles, `is_active` | `coach_id` obligatorio; el coach tiene `coach_id = id`; un solo coach (índice único parcial sobre `role='coach'`) |
| `invitations` | `id`, `coach_id`, `email`, `token_hash`, `expires_at`, `used_at`, `used_by` | token guardado solo como hash; un solo uso; correo único entre invitaciones vigentes |
| `login_attempts` | `email_hash`, `failed_count`, `window_started_at`, `locked_until` | solo accesible con service role |
| `exercises` | `id`, `coach_id` (nulo = catálogo base), `name`, `muscle_group`, `equipment`, `is_bodyweight`, `progression_increment_kg` (defecto 2,5; 1 o 2 en mancuernas/máquinas), `archived_at` | nombre único por `coach_id` (case-insensitive) |
| `programs` | `id`, `coach_id`, `student_id` (nulo = plantilla), `source_program_id`, `name`, `weeks_count` (1–16), `start_date` (lunes), `ends_on` | `start_date` es lunes; exclusión de solapamiento por alumno sobre `daterange(start_date, ends_on, '[]')` (btree_gist); plantillas sin fechas |
| `program_sessions` | `id`, `program_id`, `week_number`, `label` (A, B, C…), `position` | único (`program_id`, `week_number`, `label`); hasta 7 por semana |
| `session_exercises` | `id`, `program_session_id`, `exercise_id`, `position`, `sets` (1–10), `reps_min`, `reps_max` (1–100), `target_weight_kg` (0–500, nulo), `note` | `reps_min ≤ reps_max`; hasta 15 por sesión |
| `workouts` | `id` (**generado en el cliente**, idempotencia DC-8), `student_id`, `program_id`, `program_session_id`, `session_label`, `started_at`, `finished_at`, `duration_seconds`, `performed_on` (date Santiago), `week_start` (lunes) | `finished_at ≥ started_at`; `started_at` no más de 5 min en el futuro; `program_session_id` debe pertenecer al programa del alumno |
| `workout_sets` | `id`, `workout_id`, `student_id` (desnormalizado para RLS e índices), `exercise_id`, `exercise_name`, `position`, `set_number`, `weight_kg` (0–500), `reps` (≥1), `is_warmup` | solo series completadas (RF-23) |
| `comments` | `id`, `workout_id`, `author_id`, `body` (1–500) | sin edición (DC-14) |
| `body_measurements` | `id`, `student_id`, `measured_on`, `weight_kg` (20–300), `waist_cm`, `chest_cm`, `arm_cm` (10–250) | único (`student_id`, `measured_on`); al menos un campo no nulo |
| `progress_photos` | `id`, `student_id`, `taken_on`, `tag` (frente\|lado\|espalda\|nulo), `storage_path`, `size_bytes` | máximo 3 por (`student_id`, `taken_on`) por trigger; `size_bytes ≤ 1 048 576` |

Índices: `workouts(student_id, performed_on desc)`, `workouts(student_id, week_start)`, `workout_sets(student_id, exercise_id)`, `workout_sets(workout_id)`, `program_sessions(program_id, week_number)`, `comments(workout_id, created_at)`.

**Derivados (no se guardan):** semana del programa (`weeks.ts`), sesión cumplida y extras (`completion.ts`), "no realizada" (RF-25: planificada de una semana pasada sin entrenamiento), racha, récords, volumen, sugerencia de progresión, cumplimiento semanal.

**Funciones SQL** (todas con `set search_path = ''` y tests):
- `assign_program(template_id, student_id, start_date)` — valida que el llamador sea el coach del alumno, ajusta al lunes, copia en profundidad, recorta `ends_on` del programa vigente (DC-10) y devuelve el id nuevo. Atómica. (RF-16, 18)
- `is_coach_of(student uuid)` y `current_coach_id()` — `security definer stable`, base de las políticas.
- `validate_invitation(token_hash)` — solo devuelve `valida/vencida/usada`; es lo único accesible sin sesión (DC-5).
- Trigger de máximo 3 fotos por fecha y trigger que impide cambiar `role`, `coach_id` y `is_active` a quien no sea el coach (DC-5).

## 5. Seguridad (RLS)

Principio: todo `deny` por defecto; cada política es explícita. Roles de base de datos: `authenticated` y `anon` (este último sin acceso a ninguna tabla).

| Tabla | Alumno (y coach como alumno) | Coach sobre sus alumnos |
|---|---|---|
| `profiles` | select propio; update de `full_name` propio | select de sus alumnos; update de `is_active` |
| `exercises` | select de globales y de su coach (no archivados) | CRUD de los suyos; globales solo lectura |
| `programs`, `program_sessions`, `session_exercises` | select de los suyos (`student_id = uid`) | CRUD de los suyos (`coach_id = uid`) |
| `workouts`, `workout_sets` | insert y select propios; update/delete propios solo si `performed_on ≥ hoy_Santiago − 7` (RF-26b) | select |
| `comments` | select e insert si puede ver el entrenamiento (`author_id = uid`); delete propio | igual (select, insert, delete propio) |
| `body_measurements`, `progress_photos` | CRUD propio | select |
| `invitations` | sin acceso | CRUD propio |
| `login_attempts` | sin acceso | sin acceso (solo service role) |
| Storage `progress-photos` | CRUD bajo la carpeta `{uid}/` | select de la carpeta de sus alumnos; URL firmada de 300 s |

El bucket es privado, con tipos permitidos (JPEG, WebP) y límite de 1 MB. Las URL firmadas se piden en el servidor o con la sesión del usuario, nunca con service role en el cliente.

## 6. Flujos clave

1. **Alta del coach (RF-4, DC-1):** `scripts/create-coach.ts` con service role, una vez. Registro público deshabilitado en `config.toml` y en el panel.
2. **Invitación (RF-1 a 3, DC-2):** el coach crea la invitación (correo + token aleatorio mostrado una sola vez como enlace; se guarda el hash). El enlace abre `/invite/[token]`; un route handler valida, crea el usuario con `auth.admin.createUser`, inserta el perfil, marca la invitación usada, todo en una transacción compensada, y abre sesión.
3. **Login (RF-5, 6):** server action que consulta `login_attempts`, llama a `signInWithPassword` y actualiza el contador; error genérico siempre.
4. **Restablecimiento (RF-7):** el coach pide el enlace; el servidor verifica `is_coach_of` y usa `auth.admin.generateLink({type:'recovery'})`; el enlace vence a las 24 h.
5. **Mi semana (RF-19, 25):** el servidor trae el programa vigente del alumno, sus sesiones de la semana y sus entrenamientos de esa semana; `completion.ts` marca hechas, pendientes y no realizadas.
6. **Ejecutar sesión (RF-20 a 24, 26, DC-6, 8, 9):** el cliente crea el id del entrenamiento y un borrador en `localStorage` (clave por usuario + id); precarga pesos según DC-9; al terminar llama a `saveWorkout`, que hace upsert por id. Si falla, conserva el borrador, muestra aviso y reintenta al volver la conexión (`online`). Sin series completadas no se guarda (RF-23).
7. **Progreso (RF-28 a 30, DC-7, 16):** consultas por alumno y ejercicio sobre `workout_sets`; cálculo en `domain/`; gráficos con carga diferida.
8. **Coach (RF-33 a 35):** lista de alumnos con última actividad, cumplimiento semanal y fecha del último comentario; detalle con historial, récords, racha y medidas. Datos al abrir o refrescar.
9. **Comentarios (RF-36, DC-14):** Server Action con validación de 500 caracteres; RLS exige poder ver el entrenamiento.
10. **Medidas y fotos (RF-38 a 43, DC-15, 18):** las fotos se reducen y convierten en el cliente (HEIC con carga diferida de la librería), se suben a `{uid}/{uuid}.webp`, y luego se registra la fila; si la fila falla, se borra el archivo.

## 7. Estrategia de tests

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unitarios | Vitest sobre `src/domain/` | Semanas y zona horaria (cambio de hora de Chile, medianoche), cumplida/extras, racha con descarga y semanas sin programa, récords (primer registro no cuenta, calentamiento excluido), progresión (rango fijo, peso corporal, sin peso objetivo), volumen, límites de zod. Objetivo: todas las ramas de las reglas DC-6 a DC-17 |
| Base de datos | pgTAP (`supabase test db`) | Matriz de RLS: alumno A no lee ni escribe lo de B ni lo del coach; usuario sin sesión no accede a nada; coach solo a sus alumnos; no se puede cambiar el propio rol; ventana de 7 días; trigger de fotos; `assign_program` (solapamiento, lunes, atomicidad); `validate_invitation` no expone datos; políticas de Storage |
| Integración | Vitest con Supabase local | Server actions: invitación completa, idempotencia de `saveWorkout` (doble envío), bloqueo tras 5 intentos |
| E2E | Playwright contra Supabase local | Flujo criterio de finalización: invitar → registrarse → asignar → ejecutar sesión → coach ve el progreso y comenta; guardado fallido y reintento (red cortada); foto inválida |
| Calidad | ESLint, `tsc --noEmit`, `next build` | Puerta en cada tarea |

**CI (GitHub Actions)**: instala, lint, tipos, Vitest, `supabase start` + pgTAP, build. E2E en cada PR hacia `main` (el tiempo lo decide la tarea de CI). Una tarea no está hecha con algo en rojo (constitución 6).

## 8. Cobertura RF → componente

| RF | Parte del plan |
|---|---|
| 1–6, DC-1 a 5 | §6 flujos 1–3, `invitations`, `login_attempts`, `profiles` |
| 7 | §6 flujo 4 |
| 8 | `profiles.is_active` + middleware (bloquea acceso) |
| 9–11, DC-12 | `exercises`, `seed.sql`, políticas |
| 12–18, DC-10, 11, 13 | `programs`, `program_sessions`, `session_exercises`, `assign_program`, `weeks.ts` |
| 15b | `progression.ts`, `exercises.progression_increment_kg` |
| 19, 25 | `weeks.ts`, `completion.ts`, §6 flujo 5 |
| 20–24, 26, 26b, DC-6, 8, 9 | `workouts`, `workout_sets`, `draft.ts`, `saveWorkout`, §6 flujo 6 |
| 28–30, DC-7, 16 | `records.ts`, `volume.ts`, `streak.ts`, gráficos |
| 33–35, DC-22 | `coach/students`, `week` reutilizado para "Mi entrenamiento" |
| 36, DC-14 | `comments` |
| 38, 39, DC-15 | `body_measurements`, `schemas.ts`, gráfico |
| 40–43, DC-18 | `progress_photos`, Storage, `schemas.ts` |
| 44, 49 | §5 completo, T5 |
| 46, DC-20 | `with-timeout.ts`, `loading.tsx`/`error.tsx` por ruta |
| Fase 2 (27, 31, 32, 37, 45, 47, 48) | Fuera de este plan; solo se dejan los puntos de extensión (p. ej. tabla `achievements` no creada todavía) |

## 9. Orden de construcción (alimenta `tasks.md`)

| Hito | Contenido | Dependencia | Día objetivo |
|---|---|---|---|
| M0 | Scaffold Next.js + TS + Tailwind + shadcn, Supabase CLI local, lint/tipos, CI vacía, AGENTS.md | — | Mié 7 |
| M1 | Esquema, funciones, RLS, seed de ejercicios y tests pgTAP | M0 | Jue 8 |
| M2 | Auth: alta del coach, invitación, login con bloqueo, restablecimiento, middleware | M1 | Vie 9 |
| M3 | `domain/` completo con tests (semanas, completion, streak, records, progression, volume) | M0 (en paralelo con M2) | Vie 9 – Sáb 10 |
| M4 | Biblioteca de ejercicios y programas (editor, copiar semana, asignar) | M1, M2 | Sáb 10 – Dom 11 |
| M5 | Mi semana y ejecución de sesión (borrador, guardado idempotente, calentamiento, edición 7 días) | M3, M4 | Dom 11 – Lun 12 |
| M6 | Progreso: récords, racha, gráficos, sugerencia de progresión | M3, M5 | Lun 12 |
| M7 | Panel del coach y comentarios | M5 | Mar 13 |
| M8 | Medidas y fotos | M1, M2 | Mar 13 |
| M9 | E2E, endurecimiento, despliegue a producción, datos reales de los 2 alumnos | todo | Mar 13 – Mié 14 |

M3 se hace en paralelo porque es lógica pura sin dependencias de UI ni de base de datos.

## 10. Riesgos y mitigaciones

| Riesgo | Efecto | Mitigación |
|---|---|---|
| Plazo (7 días para todo el MVP) | Hitos M7 a M9 se comprimen | Fase 2 ya definida; si hay retraso, se recorta dentro de M8 (fotos) antes que seguridad o tests de RLS |
| Supabase Free pausa proyectos tras ~7 días sin actividad | El sistema deja de responder | Los 3 usuarios entrenan seguido; documentar cómo reactivar; considerar un ping programado |
| Supabase Free: límites de almacenamiento (1 GB) y de correo | Fotos y recuperación | Fotos de ≤1 MB; sin correos automáticos (DC-3, RF-7) |
| Vercel Hobby prohíbe uso comercial | Si cobras por el coaching, el despliegue incumpliría los términos | Confirmar si el uso es comercial; alternativa con el mismo $0: Cloudflare Pages o Netlify con adaptador de Next.js |
| HEIC en navegadores sin decodificador | Fotos de iPhone fallan | Conversión en cliente con carga diferida; mensaje alternativo (DC-18) |
| Cambio de hora de Chile (verano/invierno) | Errores en semanas y fechas | Pruebas unitarias en las fechas de transición; todo el cálculo vía `Intl` con `America/Santiago` |
| Región de la base ≠ São Paulo | Latencia mayor desde Chile | Verificar la región del proyecto (D9); decidir si se migra |
| Service role mal usado | Fuga total de datos | `admin.ts` marcado `server-only`, solo en 3 puntos, revisión específica y test |
| Docker o la CLI de Supabase fallan en la máquina | Bloquea M1 | Instalar la CLI como dependencia de desarrollo; comprobar en M0 |

## 11. Pendientes antes de las tareas
- Crear el repositorio `Domarchi/iron-strength-v2` en GitHub (decisión tuya: privado o público) y el primer commit del scaffold. No lo hago sin tu confirmación.
- `supabase login` y `supabase link --project-ref hmkgxhszamktvisrifxv` los ejecutas tú en tu terminal; yo no manejo tus credenciales.
- Confirmar la región del proyecto de Supabase (D9).
- Confirmar si el uso de la app es comercial (riesgo de Vercel Hobby).
