# T181 — Publicación

Estado del 23 de octubre de 2026: **T170–T181 publicadas** en https://iron-strength-seven.vercel.app. Se promovió el mismo artefacto B preparado y probado, sin recompilar. El propietario instruyó publicar después de conocer el bloqueo de inicio del CI; se usó la validación local completa y se conserva ese bloqueo como pendiente, sin declararlo aprobado.

Actualización de cierre: se detectó un aviso real para Next 16.4.0 y se preparó el parche compatible 16.4.3, con auditoría de producción sin avisos, check en verde y regresión documentada en validation.md. Se prepara su artefacto antes de reemplazar B. Los artefactos 16.4.0 quedan como historial, no como recuperación de seguridad predeterminada.

## Destinos y artefactos

| Elemento                                           | Identidad verificada                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Aplicación pública                                 | https://iron-strength-seven.vercel.app                                                      |
| Vercel                                             | `iron-strength`, `prj_efHmFcgn3IS5Bd4zzNShwGnewXPd`, equipo `team_NW0l4Vd8UMmxgFbZxPETPMph` |
| Código de esta entrega                             | `be1ac09d576663396af2d39f8a541c28b1b5d9d7`, Domarchi/iron-strength-v2, main-54qpxa          |
| Artefacto B publicado                              | `dpl_7CyiznBLcQZuJWAYE8zKwRVZyX2Z`                                                          |
| URL B protegida                                    | https://iron-strength-58yf7j1nr-domarchis-projects.vercel.app                               |
| BUILD_ID B                                         | `1750c8e846e94210a27c010bb7720fad`                                                          |
| Artefacto A preparado para recuperación compatible | `dpl_7iF5fXeTQCmLhDX3nfcMLz1n6ybj`, mismo código y configuración                            |
| URL A protegida                                    | https://iron-strength-384t07dm5-domarchis-projects.vercel.app                               |
| BUILD_ID A                                         | `00ca6ed51c70477f8b5b404cc7ad20c4`                                                          |
| Versión pública anterior hasta el 23 de octubre    | `dpl_4iyYTpuRF2tp1att8QpsznFRSbuq`, código `c45ee9d91ae7bc41538a3ccd0fd9c7dcb8dab9c2`       |
| Supabase exclusivo                                 | `udwhjcnlfqlggblnpchu`, iron-strength                                                       |

Ambos builds están READY, con destino production. El alias público ahora apunta a B; A se conserva como recuperación compatible. Se verificaron por HTTPS acceso e interfaz offline, BUILD_ID y worker: 64 recursos públicos dentro de la lista cerrada, lectura de borradores v1/v2/v3 y ninguna llamada a `skipWaiting`. Las cuatro variantes de ilustración coinciden por hash con el repositorio; las dos resoluciones móviles suman 46.920 bytes. No se desactivó la protección del despliegue para inspeccionarlo. No se inició sesión como el propietario.

La versión pública anterior no entiende todas las nuevas prescripciones y versiones locales. Después de habilitar esas funciones, usar A como primera opción de recuperación del frontend, conservando las migraciones aditivas. No volver automáticamente al código c45ee9d ni borrar datos para hacer coincidir una interfaz antigua.

## Bloqueo del CI

El push del código produjo [39664836047](https://github.com/Domarchi/iron-strength-v2/actions/runs/39664836047), con `startup_failure`/`BuildFailed`, cero trabajos y sin logs. La ejecución manual del workflow activo CI, [39665790586](https://github.com/Domarchi/iron-strength-v2/actions/runs/39665790586), terminó también en `startup_failure`, antes de ejecutar pruebas. El archivo del workflow no cambió desde la versión publicada y sus permisos están habilitados. La causa de plataforma/cuenta no está confirmada; no se atribuye a facturación sin evidencia.

El 21 de octubre se solicitó al propietario el aviso y se retuvo la promoción. El 23 de octubre instruyó expresamente publicar. Se volvió a despachar el workflow activo: [39962550656](https://github.com/Domarchi/iron-strength-v2/actions/runs/39962550656) terminó también en startup_failure antes de pruebas. La publicación se realizó con los controles locales completos ya aprobados para el mismo código: check con 506 unitarias, 270 integración, 459 pgTAP y 191 E2E, un skip CDP previsto en WebKit. No se modificó el workflow para ocultar el fallo ni se afirma CI en verde. Las pruebas locales se registran por separado en validation.md.

## Base y recuperación

Supabase tiene **39 migraciones**, coincidentes con el repositorio. Se aplicaron únicamente estas tres pendientes, verificadas por dry-run y ensayadas sobre la restauración del respaldo real:

1. `20261021120000_atomic_routine_additions.sql`.
2. `20261021120001_reviewed_planning.sql`.
3. `20261021120002_prescription_series.sql`.

El [ensayo de restauración](../../docs/backup-restore.md) compara datos y permisos antes de ensayar estas migraciones. El respaldo se actualizó el 23 de octubre porque había actividad de Auth: seis volcados privados, restauración de 49 tablas/514 filas, 51 políticas y 26 propietarios/banderas coincidentes. No hubo cambios mientras se generaba; volvió a comprobarse antes de aplicar. Se conservan las huellas de las 18 tablas públicas previas después de migrar. RLS activa, fotos privadas, ambas columnas de detalle y tres mutaciones invoker con permiso solo autenticado verificadas. No hubo reset, semillas ni pruebas destructivas sobre producción. La base interactiva local conserva su huella original y tampoco se reseteó.

## Secuencia ejecutada y pendientes

1. Identidad remota y respaldo actualizados y verificados; cambios de Auth conservados.
2. Aplicación de tres migraciones por `supabase db push --linked`, sin reset ni reparación del historial. Auditoría posterior: 39 versiones, RLS, bucket privado y datos conservados.
3. B verificado y promovido sin recompilar. Alias público y BUILD_ID confirmados. Asignación automática del dominio desactivada después de promover.
4. Comprobación pública de acceso, offline, manifiesto, iconos, variantes y worker; 200. Rutas privadas sin sesión redirigen 307 a login; su documento de acceso usa no-store. GET de la API de sincronización rechaza método con 405. Ningún dato personal se incorporó al caché.
5. URL HTTPS solicitada en el panel de Codex; la apertura quedó queued y no se declara una prueba autenticada del propietario. A conserva la recuperación compatible.

Pendientes separados: resolver startup_failure en GitHub y registrar aceptación física Android/iPhone. No se crearon alumnos reales ni se enviaron invitaciones por esta entrega. Evidencia privada en `work/t181-release-20261023/`, fuera de Git; ningún respaldo o secreto se publica.

## Prueba breve después de publicar

Coach en escritorio: abrir una ficha → Adaptar una base → elegir una copia → ajustar una sesión → revisar copias de semanas → revisar alumno/fechas → asignar. Comprobar que el original conserva sus valores. El benchmark automatizado de cuatro semanas homogéneas mide 40 acciones frente a 95 (57,89 % menos); no representa todas las planificaciones posibles.

Cada alumno en móvil, y el coach en su propio entrenamiento: Ver rutina sin iniciar → empezar/retomar → cambiar de ejercicio desde el índice → completar una superserie → revisar pendientes → cerrar → Ver resultado. Probar una prescripción por serie, prioridad de peso indicado y copia explícita de historial sin cambiar series completadas.

En un teléfono con cuenta propia: descargar, cerrar todas las ventanas, modo avión, entrenar, cerrar y reabrir, reconectar y confirmar un solo resultado. Una versión que espera actualizarse debe pedir cerrar las pestañas, conservando el borrador. Seguir [el protocolo físico](../../docs/phone-validation.md); la emulación no acredita estos pasos en Android/iPhone reales. No hay tres alumnos reales creados por esta entrega ni se enviaron invitaciones automáticamente.
