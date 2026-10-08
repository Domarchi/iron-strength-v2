# Tareas — Spec 002 (experiencia móvil)

Reglas: una tarea a la vez, tests primero, commit `Tn: título`, `npm run check` en verde.

## M10 — Móvil

- [x] **T107 · Dominio del descanso** — `src/domain/rest-timer.ts`: duración por defecto (90 s, 60 s tras calentamiento), ajuste ±15 s con límites 15 s–10 min, tiempo restante desde la hora de término, formato `m:ss`. Tests primero. RF: 27.
- [ ] **T108 · Dominio de series anteriores y valores de referencia** — `src/lib/workout/runner-state.ts`: `previousFor(exercise, setIdx)`, `copyPrevious`, `fillMissing` (RF-55, DC-27), progreso por ejercicio y `isExerciseComplete`. Tests primero. RF: 53–55, 56.
- [ ] **T109 · Dominio de la tira semanal** — `src/domain/week-strip.ts`: 7 días lun–dom con `isToday`, `trained`, `isFuture`; elección de la próxima sesión pendiente. Tests primero. RF: 61, 62.
- [ ] **T110 · Base móvil** — viewport-fit cover, color de tema, áreas seguras, modo enfoque que oculta cabecera y barra en `/workout/…`. RF: 50–52.
- [ ] **T111 · Sesión rediseñada** — filas con columna "Anterior", check grande, ejercicios que se pliegan, menús de serie y de ejercicio, barra superior con Terminar, Wake Lock. Conserva las etiquetas accesibles. RF: 53–59.
- [ ] **T112 · Temporizador de descanso (UI)** — barra fija inferior, ±15 s, saltar, vibración, exacto tras bloqueo de pantalla. RF: 27, 60.
- [ ] **T113 · Mi semana rediseñada** — tira semanal, tarjeta "Hoy toca", lista compacta, racha en una línea. RF: 61–63.
- [ ] **T114 · PWA instalable** — `app/manifest.ts`, iconos con `ImageResponse`, icono Apple. RF: 45.
- [ ] **T115 · E2E móvil y accesibilidad** — proyecto Playwright en 375×812 con el flujo de sesión (anterior, copiar, descanso, terminar), sin scroll horizontal, axe AA en claro y oscuro. Actualizar E2E existentes si cambian los flujos. Criterios 1–6.
- [ ] **T116 · Cierre** — validar RF-27, 45 y 50–63 en `specs/001-mvp/validation.md`, actualizar README/AGENTS y tasks de la 001.
