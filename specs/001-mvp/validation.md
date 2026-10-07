# Validación RF por RF — Spec 001 (T105)

Fecha: 2026-10-07 · Código: `main` · Resultado de las suites: **642 pruebas en verde**

| Suite                                                     | Cómo se corre      | Resultado |
| --------------------------------------------------------- | ------------------ | --------- |
| Unitarias (dominio y utilidades)                          | `npm test`         | 242       |
| Integración (acciones y datos contra Supabase local)      | `npm run test:int` | 172       |
| Base de datos (RLS, restricciones, funciones) con pgTAP   | `npm run db:test`  | 214       |
| E2E (Playwright, build de producción, móvil y escritorio) | `npm run test:e2e` | 14        |

Cobertura de ramas del dominio (`src/domain`): ≥ 90 % como puerta de calidad (`npm run test:coverage`).

Leyenda: **U** unitaria · **I** integración · **P** pgTAP · **E** E2E.

## Requisitos del MVP

| RF    | Qué se verifica                                                                                           | Dónde                                                          |
| ----- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1     | Invitación de un solo uso que vence en 7 días; solo el hash del token                                     | I `invitations/create`, `token.test`, P 01                     |
| 2     | Registro con enlace válido crea el alumno vinculado al coach                                              | I `invitations/register`, E `flujo-principal`                  |
| 3     | Enlace vencido, usado o inexistente se rechaza sin crear nada                                             | I `register`, P 07                                             |
| 4     | Sin registro público; coach único                                                                         | I `signup-disabled`, `create-coach`, P 01                      |
| 5     | Login válido por rol; error genérico igual para correo inexistente y clave errónea                        | I `login`, E `smoke`                                           |
| 6     | Mínimo 8 caracteres; 5 intentos fallidos bloquean 15 min                                                  | U `rate-limit`, I `login`, `register`                          |
| 7     | El coach genera un enlace de restablecimiento de 24 h y un solo uso                                       | I `reset-link`                                                 |
| 8     | Desactivar bloquea al instante, incluso con sesión abierta; reversible                                    | I `set-active`, E `seguridad`                                  |
| 9     | Catálogo base (467 ejercicios de v1) cargado y de solo lectura                                            | I `exercises`, P 02                                            |
| 10    | El coach crea ejercicios propios visibles para sus alumnos                                                | I `exercises`                                                  |
| 11    | Solo el coach edita; archivar en vez de borrar                                                            | I `exercises`, P 02                                            |
| 12    | Programa de 1 a 16 semanas                                                                                | I `programs`, U `schemas`, P 01                                |
| 13    | Hasta 7 sesiones por semana (A–G); semana de descarga válida                                              | I `programs`, P 01                                             |
| 14    | Series 1–10, reps 1–100 (mín ≤ máx), peso 0–500 kg, nota ≤ 500                                            | I `programs`, U `schemas`, P 01                                |
| 15    | Copiar semana (copia profunda, reemplazo explícito)                                                       | P 10, I `programs`                                             |
| 15b   | Doble progresión como sugerencia visual (rango fijo, peso corporal, sin historial)                        | U `progression`, I `workout-context`                           |
| 16    | Asignar crea una copia independiente; fecha ajustada al lunes                                             | P 08, I `programs`                                             |
| 17    | Solo se editan semanas posteriores a la en curso                                                          | U `program-weeks`, I `programs`                                |
| 18    | Un programa activo; el nuevo recorta al anterior                                                          | P 01, 08, U `program-weeks`                                    |
| 19    | "Mi semana": sesiones, estados y vacíos                                                                   | I `week`, U `completion`, E `flujo-principal`                  |
| 20    | Prescripción y "última vez" al iniciar una sesión                                                         | I `workout-context`, E `flujo-principal`                       |
| 21    | Registrar peso y repeticiones de cada serie                                                               | U `runner-state`, E `flujo-principal`                          |
| 22    | La sesión en curso sobrevive a recargas                                                                   | U `draft`, E `flujo-principal`                                 |
| 23    | Solo se guardan series completadas; sin series no se guarda                                               | U `runner-state`, I `save-workout`, P 12                       |
| 24    | Sin conexión se conserva y se reintenta sin duplicar                                                      | E `guardado-sin-conexion`, I `save-workout`, P 12              |
| 25    | Sesiones sin hacer de una semana pasada = no realizadas                                                   | U `completion`, I `week`                                       |
| 26    | El alumno no cambia ejercicios; sí series extra, calentamiento, saltar y descartar                        | U `runner-state`                                               |
| 26b   | Editar o borrar un entrenamiento hasta 7 días después                                                     | U `edit-window`, I `workout-edit`, P 04                        |
| 28    | Récords de peso y 1RM; el primero no se celebra; calentamiento excluido                                   | U `records`, I `progress`                                      |
| 29    | Racha en semanas y calendario de constancia                                                               | U `streak`, `constancy`, I `streak`                            |
| 30    | Gráfico de progreso por ejercicio                                                                         | U `volume`, `chart`, I `progress`, E `accesibilidad`           |
| 33    | Lista de alumnos con actividad y cumplimiento                                                             | I `students`                                                   |
| 34    | Detalle del alumno: historial, récords, racha                                                             | I `workouts`, `progress`, `streak`, E `flujo-principal`        |
| 35    | El coach ve lo guardado al abrir o refrescar                                                              | E `flujo-principal`                                            |
| 36    | Comentarios por entrenamiento (500 caracteres, cada autor borra los suyos)                                | I `comments`, P 05, E `flujo-principal`                        |
| 38    | Medidas validadas, un registro por fecha                                                                  | I `measurements`, U `schemas`                                  |
| 39    | Evolución de cada medida, visible para el coach                                                           | I `measurements`, E `accesibilidad`                            |
| 40–43 | Foto reducida a ≤ 1 MB, bucket privado, enlace firmado de 5 min, borrado definitivo, rechazo de inválidas | U `image`, I `photos`, P 06, E `seguridad`                     |
| 44    | RLS en todas las tablas y Storage                                                                         | P 01–12, E `seguridad`                                         |
| 46    | Tiempo límite de 10 s con error y reintento; estados de carga y vacíos                                    | U `fetch-with-timeout` (parcial: ver abajo), E `accesibilidad` |
| 49    | El coach se asigna programas y entrena como un alumno más                                                 | I `programs`, P 08                                             |

## Decisiones de clarificación (DC)

DC-1 a DC-5 (cuentas y seguridad): I `create-coach`, `register`, `login`, P 07, 09. DC-6 a DC-9 (entrenamiento): U `records`, `progression`, `runner-state`, I `save-workout`. DC-10 a DC-13 (programas): P 08, U `program-weeks`, `schemas`. DC-14 a DC-16 (comentarios, medidas, volumen): I `comments`, `measurements`, U `volume`. DC-18 (fotos): U `image`, I `photos`. DC-19 a DC-22: ids estables, U `fetch-with-timeout`, E `accesibilidad`, I `students`. DC-17 (logros) es Fase 2.

## Criterios de finalización de la spec

| Criterio                                                                                  | Estado                                      |
| ----------------------------------------------------------------------------------------- | ------------------------------------------- |
| Todos los RF del MVP con al menos un test en verde                                        | Cumplido (tabla superior)                   |
| Tests de RLS: A no lee ni escribe lo de B ni lo del coach; sin sesión no se accede a nada | Cumplido: pgTAP 02–07, 12 y E2E `seguridad` |
| E2E: invitar → registrarse → asignar → ejecutar → el coach ve y comenta                   | Cumplido: `e2e/flujo-principal.spec.ts`     |
| Lint, tipos y build en verde                                                              | Cumplido: `npm run check` y CI              |
| Despliegue en producción con las dos cuentas reales                                       | **Pendiente del usuario** (T36, T103, T104) |

## Limitaciones conocidas (honestas)

1. **RF-46**: el límite de 10 s está probado a nivel de la consulta; la pantalla de error con "Reintentar" no tiene un test automatizado (no se puede simular una caída del servidor desde el navegador de pruebas). Se revisó a mano su código y su texto.
2. **El catálogo base incluye ejercicios de "Cardio"** (42), pensados para peso y repeticiones. Para cardio de tiempo o distancia no hay campos propios; el MVP no los modela.
3. **Fase 2 sin construir**: temporizador de descanso (27), logros (31), resumen semanal (32), no leídos (37), PWA instalable (45), exportar CSV (47) y borrar cuenta (48).
4. Los tests de integración y E2E **borran todos los usuarios de la base local**; por eso verifican que la URL sea local antes de correr.

## Veredicto

Todo lo que se puede verificar sin la cuenta de producción **cumple la spec**. Falta solo la puesta en producción, que requiere tus credenciales de Supabase y Vercel.
