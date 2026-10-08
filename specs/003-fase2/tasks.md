# Tareas — Spec 003 (Fase 2)

Reglas: una tarea a la vez, tests primero, commit `Tn: título`, `npm run check` en verde. Toda tabla o función nueva lleva RLS/permisos y su test pgTAP.

## M11 — Fase 2

- [x] **T117 · CSV: dominio** — `src/domain/csv.ts` (escapar campos, neutralizar fórmulas, BOM, `;`, coma decimal, CRLF) y construcción de filas desde el historial. Tests primero. RF: 47, 67.
- [ ] **T118 · CSV: datos, ruta y botones** — `src/lib/data/export.ts` + `GET /export/history` (alumno propio o alumno del coach; si no, 404), botones en "Mi cuenta" y en la ficha del alumno. Test de integración con acceso de coach, propio y ajeno. RF: 47, 64.
- [ ] **T119 · Logros: dominio** — `src/domain/achievements.ts`: catálogo, evaluación pura a partir de estadísticas, condición legible de cada logro. Tests primero. RF: 31.
- [ ] **T120 · Logros: base y datos** — migración `achievements` con RLS y pgTAP; `src/lib/data/achievements.ts` (`syncAchievements`, `listAchievements`) con integración; se llama al guardar un entrenamiento. RF: 31, 66; DC-28.
- [ ] **T121 · Logros: pantallas** — aviso al guardar (RF-65), lista en Progreso y en la ficha del alumno para el coach (RF-66). RF: 65, 66.
- [ ] **T122 · Resumen semanal: dominio y datos** — `src/domain/weekly-summary.ts` + `src/lib/data/weekly-summary.ts` (semana anterior y en curso, sesiones, récords, volumen y variación). Tests y integración. RF: 32; DC-29.
- [ ] **T123 · Resumen semanal: pantalla** — `/week/summary` enlazada desde "Mi semana", con estados vacíos. RF: 32.
- [ ] **T124 · No leídos: base y datos** — migración `comment_reads` + función `unread_comments` con RLS y pgTAP; `src/lib/data/unread.ts` (conteos, marcar leído) con integración. RF: 37; DC-30.
- [ ] **T125 · No leídos: pantallas** — marcar leído al abrir un entrenamiento; marcas en historial y ficha del alumno; contadores en la lista de alumnos y en la navegación. RF: 37.
- [ ] **T126 · Borrar cuenta: base** — migración `delete_my_account()` con pgTAP (solo alumno, solo el propio, cascada completa). RF: 48; DC-32.
- [ ] **T127 · Borrar cuenta: datos y acción** — borrar fotos de Storage con la sesión del alumno y luego la función; integración (datos y archivos desaparecen, el coach no puede, un fallo de fotos aborta). RF: 48.
- [ ] **T128 · Mi cuenta** — pantalla `/account` con enlace en el encabezado, exportar, cerrar sesión y borrado con confirmación BORRAR. RF: 64, 48.
- [ ] **T129 · E2E de la Fase 2 y accesibilidad** — logro al terminar, resumen, no leído, CSV y borrar cuenta; axe AA en claro y oscuro en las pantallas nuevas. Criterios 1–5.
- [ ] **T130 · Cierre** — validación de RF-31, 32, 37, 47, 48, 64–67; revisión de seguridad (nueva función `security definer`, tabla de logros); README y AGENTS; spec 001 y memoria al día.
