# Tareas — Spec 004

- [x] **T131 · Login atómico** — Regresión concurrente, migración con permisos y pgTAP, adaptador y tipos. El check completo final pasa. La validación de la migración y la integración queda pendiente de Supabase local.
- [x] **T132 · Recuperación entre semanas** — Contexto de recuperación, protección sin borrador y acceso desde Mi semana. Pasan las regresiones de contexto y de la pantalla en jsdom, lint y tipos. E2E agregado; su ejecución requiere las claves de Supabase local.
- [x] **T133 · Rediseño claro y minimalista** — Tokens, marco, navegación, login, Mi semana, coach y sesión. Check completo en verde y 24 escenarios visuales/accesibles sin incidencias. E2E contra datos pendiente del entorno local.

Validación final y limitaciones: `validation.md`. Las casillas marcan implementación; las suites contra Supabase no se consideran verificadas.

- [x] **T134 · Interfaz de entrenamiento inspirada en Hevy** — Sustituir la propuesta verde por superficies neutras, azul, tarjetas de rutinas compactas y registro continuo con filas completadas en verde. Previsualización renovada y check completo en verde (338 tests). Contraste de tokens verificado; revisión visual y E2E pendientes por las limitaciones indicadas en validation.md.
