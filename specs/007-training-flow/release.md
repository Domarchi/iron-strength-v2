# T181 — Preparación de publicación

Estado del 21 de octubre de 2026: **código T170–T180 implementado; publicación pendiente**. El dominio conserva la versión anterior. Este documento registra artefactos preparados, no una promoción ya realizada.

## Destinos y artefactos

| Elemento                                           | Identidad verificada                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Aplicación pública                                 | https://iron-strength-seven.vercel.app                                                      |
| Vercel                                             | `iron-strength`, `prj_efHmFcgn3IS5Bd4zzNShwGnewXPd`, equipo `team_NW0l4Vd8UMmxgFbZxPETPMph` |
| Código de esta entrega                             | `be1ac09d576663396af2d39f8a541c28b1b5d9d7`, Domarchi/iron-strength-v2, main-54qpxa          |
| Artefacto B preparado para promover                | `dpl_7CyiznBLcQZuJWAYE8zKwRVZyX2Z`                                                          |
| URL B protegida                                    | https://iron-strength-58yf7j1nr-domarchis-projects.vercel.app                               |
| BUILD_ID B                                         | `1750c8e846e94210a27c010bb7720fad`                                                          |
| Artefacto A preparado para recuperación compatible | `dpl_7iF5fXeTQCmLhDX3nfcMLz1n6ybj`, mismo código y configuración                            |
| URL A protegida                                    | https://iron-strength-384t07dm5-domarchis-projects.vercel.app                               |
| BUILD_ID A                                         | `00ca6ed51c70477f8b5b404cc7ad20c4`                                                          |
| Versión que todavía recibe tráfico                 | `dpl_4iyYTpuRF2tp1att8QpsznFRSbuq`, código `c45ee9d91ae7bc41538a3ccd0fd9c7dcb8dab9c2`       |
| Supabase exclusivo                                 | `udwhjcnlfqlggblnpchu`, iron-strength                                                       |

Ambos builds nuevos están READY, con destino production y sin asignación del dominio. Se verificaron las respuestas de acceso y la interfaz offline de B, su BUILD_ID y su worker: 64 recursos públicos dentro de la lista cerrada, lectura de borradores v1/v2/v3 y ninguna llamada a `skipWaiting`. No se desactivó la protección del despliegue para inspeccionarlo. No se inició sesión como el propietario.

La versión pública anterior no entiende todas las nuevas prescripciones y versiones locales. Después de habilitar esas funciones, usar A como primera opción de recuperación del frontend, conservando las migraciones aditivas. No volver automáticamente al código c45ee9d ni borrar datos para hacer coincidir una interfaz antigua.

## Bloqueo del CI

El push del código produjo [39664836047](https://github.com/Domarchi/iron-strength-v2/actions/runs/39664836047), con `startup_failure`/`BuildFailed`, cero trabajos y sin logs. La ejecución manual del workflow activo CI, [39665790586](https://github.com/Domarchi/iron-strength-v2/actions/runs/39665790586), terminó también en `startup_failure`, antes de ejecutar pruebas. El archivo del workflow no cambió desde la versión publicada y sus permisos están habilitados. La causa de plataforma/cuenta no está confirmada; no se atribuye a facturación sin evidencia.

Se solicitó al propietario el aviso mostrado por GitHub. No se marca el CI como aprobado ni se promueve por defecto mientras se aclara este bloqueo. Las pruebas locales se registran por separado en validation.md.

## Base y recuperación

El remoto conserva 36 migraciones. Tres pendientes, verificadas por dry-run y ensayadas sobre la restauración del respaldo real:

1. `20261021120000_atomic_routine_additions.sql`.
2. `20261021120001_reviewed_planning.sql`.
3. `20261021120002_prescription_series.sql`.

El [ensayo de restauración](../../docs/backup-restore.md) compara datos y permisos antes de ensayar estas migraciones. No hubo reset, semillas ni pruebas destructivas sobre producción. La base interactiva local recibió las tres migraciones después de un respaldo completo y conserva su huella de datos original; tampoco se reseteó.

## Secuencia restante

1. Resolver o aclarar el bloqueo de GitHub y registrar el resultado. Mantener separadas la validación local y la de CI.
2. Verificar de nuevo el proyecto Supabase exclusivo, las 36 versiones remotas y los cambios de datos desde el respaldo. Actualizar el respaldo si corresponde.
3. Aplicar únicamente las tres migraciones pendientes con `supabase db push --linked`, nunca reset o reparación automática del historial. Comprobar 39 versiones, RLS, bucket privado y conservación de datos.
4. Volver a verificar B contra esa base: BUILD_ID, acceso público, recursos, worker y redirecciones privadas sin caché. No crear cuentas sintéticas ni suplantar al coach en producción.
5. Promover **el mismo B**, sin recompilar. Confirmar que el alias público apunta a su ID y sirve su BUILD_ID. Mantener desactivada la asignación automática del dominio.
6. Registrar URL, migraciones, controles y A como recuperación compatible; abrir la URL HTTPS y seguir la guía de cuatro cuentas. Marcar T181 solo después de esa publicación verificada.

## Prueba breve después de publicar

Coach en escritorio: abrir una ficha → Adaptar una base → elegir una copia → ajustar una sesión → revisar copias de semanas → revisar alumno/fechas → asignar. Comprobar que el original conserva sus valores. El benchmark automatizado de cuatro semanas homogéneas mide 40 acciones frente a 95 (57,89 % menos); no representa todas las planificaciones posibles.

Cada alumno en móvil, y el coach en su propio entrenamiento: Ver rutina sin iniciar → empezar/retomar → cambiar de ejercicio desde el índice → completar una superserie → revisar pendientes → cerrar → Ver resultado. Probar una prescripción por serie, prioridad de peso indicado y copia explícita de historial sin cambiar series completadas.

En un teléfono con cuenta propia: descargar, cerrar todas las ventanas, modo avión, entrenar, cerrar y reabrir, reconectar y confirmar un solo resultado. Una versión que espera actualizarse debe pedir cerrar las pestañas, conservando el borrador. Seguir [el protocolo físico](../../docs/phone-validation.md); la emulación no acredita estos pasos en Android/iPhone reales. No hay tres alumnos reales creados por esta entrega ni se enviaron invitaciones automáticamente.
