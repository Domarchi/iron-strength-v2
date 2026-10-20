# Tareas — Spec 004

- [x] **T131 · Login atómico** — Regresión concurrente, migración con permisos y pgTAP, adaptador y tipos. El check completo final pasa. La validación de la migración y la integración queda pendiente de Supabase local.
- [x] **T132 · Recuperación entre semanas** — Contexto de recuperación, protección sin borrador y acceso desde Mi semana. Pasan las regresiones de contexto y de la pantalla en jsdom, lint y tipos. E2E agregado; su ejecución requiere las claves de Supabase local.
- [x] **T133 · Rediseño claro y minimalista** — Tokens, marco, navegación, login, Mi semana, coach y sesión. Check completo en verde y 24 escenarios visuales/accesibles sin incidencias. E2E contra datos pendiente del entorno local.

Validación final y limitaciones: `validation.md`. Las casillas marcan implementación; las suites contra Supabase no se consideran verificadas.

- [x] **T134 · Interfaz de entrenamiento inspirada en Hevy** — Sustituir la propuesta verde por superficies neutras, azul, tarjetas de rutinas compactas y registro continuo con filas completadas en verde. Previsualización renovada y check completo en verde (338 tests). Contraste de tokens verificado; revisión visual y E2E pendientes por las limitaciones indicadas en validation.md.

- [x] **T135 · Registro basado en evidencia estructural de Hevy** — Dos análisis estáticos con REA de siete archivos públicos, con evidencia y límites documentados. Volumen en vivo y descanso por ejercicio implementados; edición coherente de series hechas y borradores compatibles. Check completo en verde: 350 tests. E2E autenticado y revisión visual pendientes del entorno.

- [x] **T136 · Supabase local operativo** — Runtime nativo, migraciones, entorno privado y semilla de coach/alumnos. Pasan 272 comprobaciones SQL/RLS, 204 pruebas de integración y el check completo. Verificados en el navegador el login de ambos roles, los controles del logger y el guardado real del entrenamiento. Instrucciones del entorno en `docs/local-development.md`.

- [x] **T137 · Registro fluido, detalle visual y borradores protegidos** — Ejercicio activo, teclado, deshacer, miniaturas propias, estado de guardado, borradores sin caducidad y descanso persistente. Regresiones y check en verde (359 tests). Verificados los controles y la recarga en la app real; revisión a 360 px sin desbordamientos ni objetivos menores a 44 px. Escenario Playwright preparado; suite completa pendiente.

- [x] **T138 · Editor de rutinas ágil** — Selector de semanas, prescripciones en línea, guardado por sesión con recuperación parcial, catálogo de selección múltiple y protección de cambios pendientes. Check completo en verde (372 tests); alta múltiple, validación, guardado/recarga, copia y orden verificados en la app contra Supabase local. Revisión a 360 px; suite Playwright completa pendiente.

- [x] **T139 · Completar E2E y corregir regresiones** — Supabase E2E aislado y limpieza acotada; selectores ambiguos y credenciales fijas corregidos; dos escenarios del editor añadidos. Pasan los 35 E2E y el check completo (373 pruebas). Los perfiles, programas, prescripciones y entrenamientos del desarrollo se conservaron.

- [x] **T140 · Orden por arrastre** — Asa táctil y de teclado, destino/scroll, guardado automático y reintento, conservación de permisos. Pasan 38 E2E y el check completo (378 pruebas); editor real abierto con controles de arrastre.
