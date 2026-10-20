# AGENTS.md — Iron Strength v2

## Proyecto

App de entrenamiento para un coach y sus alumnos. El coach diseña programas por semanas, los asigna, ve el progreso y comenta; los alumnos ejecutan sesiones, registran series, medidas y fotos. El coach también entrena (es alumno de sí mismo: `coach_id = id`).

Next.js 16 (App Router) + TypeScript estricto + Supabase (Postgres, Auth, Storage, RLS) + Tailwind + shadcn/ui (Base UI). La seguridad vive en la base de datos (RLS). La lógica de negocio está en `src/domain/` (TypeScript puro, sin React ni red).

Se desarrolla con **Spec-Driven Development**. Fuente de verdad: `docs/constitution.md` → `specs/001-mvp/spec.md` → `plan.md` → `tasks.md`, más `specs/002-mobile-ux/` (experiencia móvil) y `specs/003-fase2/` (logros, resumen, no leídos, CSV, borrar cuenta). El estado de verificación está en `specs/001-mvp/validation.md`. Las correcciones de concurrencia y recuperación, y el rediseño inspirado en Hevy de 2026-10-19, se describen en `specs/004-review-redesign/` (con su validación local y limitaciones de entorno).

La evolución aprobada para un coach y tres alumnos está en `specs/005-complete-training/`: editor fiable, superseries, alternativas, seguimiento y entrenamiento offline. Sus tareas pendientes no representan funciones ya disponibles.

## Comandos

- Desarrollo: `npm run dev` (datos de prueba: `npm run dev:seed`)
- Todo (formato, lint, tipos, tests unitarios, build): `npm run check`
- Unitarias: `npm test` · cobertura del dominio: `npm run test:coverage`
- Integración (Supabase local): `npm run test:int`
- Base de datos (RLS, funciones, restricciones): `npm run db:test`
- E2E (Playwright, build de producción): `npm run test:e2e`
- Base local: `npx supabase start` / `stop` / `db reset` · tipos: `npm run db:types`

Variables de entorno: copia `.env.example` a `.env.local`. Nunca commitees `.env.local`.

> Los tests de integración **borran todos los usuarios locales** (y se niegan a correr si la URL no es local). Después vuelve a ejecutar `npm run dev:seed`. Los de pgTAP (`db:test`) exigen una base **sin perfiles**: haz `npx supabase db reset` antes y `npm run dev:seed` después.
>
> E2E usa una instancia Supabase **exclusiva de pruebas**, configurada en `.env.e2e.local` (tiene prioridad sobre `.env.local`; CI puede inyectar las variables). La limpieza solo borra cuentas `@iron-strength.e2e.test` y sus archivos/intentos de login. El esquema permite un solo coach, por lo que no se puede compartir la base del desarrollo interactivo; la semilla E2E se detiene si ya contiene un coach. Nunca resetear la base de la app abierta para ejecutar E2E. Ver `docs/local-development.md`.

## Estructura

- `src/domain/`: reglas puras con tests (`dates`, `program-weeks`, `completion`, `streak`, `records`, `progression`, `volume`, `schemas`…).
- `src/lib/data/`: funciones de datos que reciben el cliente con la sesión del usuario; la RLS decide. Cada una tiene su `*.int.test.ts`.
- `src/lib/workout/`: borrador local de la sesión en curso y su lógica pura.
- `src/app/(auth)` público; `src/app/(app)` exige sesión; `(app)/coach` solo coach (`requireCoach`).
- `supabase/migrations/` esquema y RLS; `supabase/tests/database/` pgTAP (un test antes de cada política).

## Estilo y convenciones

- Código e identificadores en inglés; textos de UI y documentación en español de Chile (tuteo).
- TypeScript estricto, sin `any`. Validación con zod (`src/domain/schemas.ts`).
- Fechas y semanas siempre en America/Santiago, de lunes a domingo. Pesos en kg.
- Objetivos táctiles de al menos 44 px (el `Button` ya lo cumple); contraste AA verificado con axe en E2E.

## Particularidades de Next 16 y de las librerías (para no tropezar de nuevo)

- `middleware` ahora es `src/proxy.ts`. El proxy solo refresca la sesión y exige login; el rol y el estado activo se validan en los layouts del servidor y en la RLS. No redirijas a quien tiene sesión fuera de `/login` (un usuario desactivado entraría en bucle).
- `cacheComponents` está desactivado a propósito: todas las pantallas son por usuario.
- `Button` con `render={<Link/>}` necesita `nativeButton={false}` (el `Button` del proyecto ya lo hace) y Playwright lo ve con `role=button`.
- En `[auth.email]` de `supabase/config.toml`, `enable_signup = false` desactiva TODO el login por correo; el registro público se cierra con `[auth] enable_signup = false`.
- PostgREST rellena con `null` las columnas ausentes en una inserción masiva con filas heterogéneas: pon todas las columnas.
- Móvil: durante `/workout/…` el marco (`AppChrome`) oculta cabecera y navegación (modo enfoque). El manifiesto, `/icons/*` y `/apple-icon` son públicos en `route-access.ts`; si agregas otro recurso de la PWA, agrégalo allí.
- Borrar la cuenta (RF-48) no usa el service role: `delete_my_account()` en la base y los archivos de fotos se borran antes con la sesión del alumno. Si agregas datos nuevos por alumno, asegúrate de que caen en cascada y súmalos a `supabase/tests/database/15_delete_my_account.test.sql`.
- Organización semanal: `program_sessions.weekday` (0 lunes–6 domingo; null sin día) comparte RPC y borrador del editor (`p_weekday=-1` lo elimina). Copias conservan el día prescrito. `session_day_overrides` es la elección del alumno para su semana vigente, con RLS y cascadas; no cambia revisión, prescripción ni cumplimiento y nunca se copia.
- Biblioteca y títulos: `program_sessions.title` se guarda junto a las prescripciones con `mutate_routine_session` (argumento opcional `p_title`, vacío elimina el título). Conservarlo en borradores, revisión de conflictos, copias y asignaciones. `duplicate_program` crea una plantilla independiente desde una instantánea con recibo privado en `program_copy_receipts`; los reintentos usan el mismo ID y contenido. Las peticiones locales de copia se separan por cuenta, programa y petición, con referencia por pestaña.
- Los borradores del coach viven en `src/lib/coach/editor-draft.ts`: identidad por editor, referencia por pestaña, revisión y peticiones inciertas. No limpiar el origen recuperado si cambió desde la lectura; no reemplazar la revisión base sin mostrar y aceptar la comparación con el servidor.
- Edición múltiple: los parches llevan `fields` explícitos y SQL solo escribe esos campos. Al resolver conflictos, combinar los campos elegidos con la prescripción actual; nunca restaurar notas o pesos remotos desde el snapshot del lote. Descanso de grupo requiere todos sus integrantes. Conservar preparación, selección y parches aplicados en el borrador.
- El editor guarda lotes y órdenes con `mutate_routine_session`, revisión de sesión y request ID estable. Conservar identidad y payload al reintentar; un conflicto no debe sobrescribir cambios remotos. `routine_mutations` guarda recibos privados del coach y se elimina en cascada.
- Progreso: `src/domain/progress-period.ts` usa periodos móviles de 4/8/12 semanas hasta hoy en Santiago, con un periodo anterior contiguo de igual duración. Las marcas históricas no se filtran; las comparaciones de gráfico sí. Conservar métrica/alumno al cambiar periodo y enlazar cada resultado a su entrenamiento. No mostrar porcentajes sin datos comparables o con base cero.
- Panel del coach: señales puras en `src/domain/coach-signals.ts`, filtros y enlaces a evidencia. Inactividad usa solo entrenamientos con series, desde el máximo entre inicio y último entreno, nunca durante descarga ni para alumnos desactivados. Un fallo al leer comentarios se muestra explícitamente; no equivale a cero pendientes.
- Valoración del entrenamiento: `workouts.perceived_effort` (1–10) y `note` (hasta 500) son opcionales. Se conservan en el borrador y el payload congelado al finalizar; `save_workout` los guarda junto a las series. Historial y CSV los incluyen, con escape de texto libre. Borradores/registros anteriores pueden omitirlos.
- Sustituciones durante el registro: `workout_sets` conserva identidad prescrita/realizada y nombre original. El trigger valida originales/alternativas por posición incluso en INSERT directo; la identidad y procedencia guardadas no se reescriben (salvo limpieza por cascada). Historial, récords y progresión usan el realizado. Las opciones y la elección sobreviven en el borrador; no cambiar después de completar series.
- Alternativas: `session_exercise_alternatives` admite hasta tres por fila, con prescripción propia y RLS. `configure_session_alternatives` guarda con revisión y recibo. Conservar alternativas al copiar y sus borradores/solicitudes inciertas en el editor; las semanas actuales/pasadas también se bloquean en escritura directa. Las copias insertan padres e hijos en comandos separados de la misma transacción para que RLS vea los padres nuevos.
- Superseries: metadatos en `session_exercises`, grupos de 2–4 consecutivos validados al finalizar la transacción. `configure_session_layout` cambia grupos/descansos/orden con revisión y recibo. Copias de sesión/semana/asignación regeneran grupos; una copia individual queda fuera. Las rondas se derivan de series de trabajo en `src/domain/superset-rounds.ts`; conservar metadatos y tiempo absoluto en el borrador.
- Duplicar ejercicios/sesiones usa `duplicate_routine_item` (security invoker), con transacción completa e ID de copia estable para reintentos. El editor conserva ese ID si se pierde la respuesta. Se mantiene RF-17: solo semanas posteriores a la actual en programas activos; las plantillas se editan completas.
- Las funciones de no leídos (`unread_comments`, `mark_comments_read`) son `security invoker`: no las cambies a `security definer`, la RLS de comentarios es su única barrera.
- El linter de React marca `Date.now()` en el render y `setState` dentro de efectos: usa funciones auxiliares y manejadores.

## Reglas

- Lee `docs/constitution.md` y la spec activa antes de tocar código. Si falta una decisión, detente y pregunta.
- La spec manda: un cambio de comportamiento empieza por la spec y se actualiza en el mismo commit.
- Una tarea de `tasks.md` cada vez, **tests primero**. Commit por tarea: `Tn: <título>`.
- `src/lib/supabase/admin.ts` (service role) solo en el servidor y solo en tres puntos: registro por invitación, enlace de restablecimiento y control de intentos de login.
- Todo cambio de esquema es una migración. Toda tabla nueva lleva RLS y su test pgTAP.
- No agregues dependencias mayores ni servicios de pago sin aprobación. Nunca pegues claves ni contraseñas en el chat.

## Al terminar cualquier tarea

- `npm run check` en verde desde un estado limpio.
- Si tocaste la base: `npx supabase db reset`, `npm run db:test` y `npm run test:int`.
- Si tocaste una pantalla: `npm run test:e2e` (incluye accesibilidad).
- Marca la tarea en `tasks.md` y haz el commit.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
