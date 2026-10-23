# T181–T185 — Publicación de web y API móvil

Estado del 23 de octubre de 2026: **T170–T181 y la API móvil de consulta están publicadas** en https://iron-strength-seven.vercel.app. Se promovió el mismo artefacto E protegido y verificado, sin recompilar. El propietario autorizó publicar con controles locales y el fallo de arranque de GitHub conocido; no se declara CI verde.

## Destinos y artefactos actuales

| Elemento                      | Identidad verificada                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| Aplicación pública            | https://iron-strength-seven.vercel.app                                                |
| Vercel                        | iron-strength, prj_efHmFcgn3IS5Bd4zzNShwGnewXPd, equipo team_NW0l4Vd8UMmxgFbZxPETPMph |
| Código publicado              | cf38b907a4477290f9d1088f744402b6b629f092, Domarchi/iron-strength-v2, main-54qpxa      |
| Runtime                       | Next 16.4.3, Node 24, Sharp 0.35.5                                                    |
| E publicado                   | dpl_4oP53eMvsERAkw3f9ec4B5BroYKs                                                      |
| URL E protegida               | https://iron-strength-fuuvav8k1-domarchis-projects.vercel.app                         |
| BUILD_ID E                    | cefb52e61feb46d4944d84fc776f95cc                                                      |
| F preparado para recuperación | dpl_3ffHvzqJvyZWMq9eDSegRhB7zmMz, mismo código y contrato móvil                       |
| URL F protegida               | https://iron-strength-k65l9r6t5-domarchis-projects.vercel.app                         |
| BUILD_ID F                    | e8e079d4bef0489b98d37e9eebfa756d                                                      |
| Supabase exclusivo            | udwhjcnlfqlggblnpchu, iron-strength, 39 migraciones                                   |

E y F están READY/production. Acceso, worker con 64 recursos, borradores v1/v2/v3 y ausencia de skipWaiting verificados antes de publicar. La API se comprobó usando la identidad CLI existente, sin desactivar protección: 401 JSON privado sin bearer y 400 ante login vacío; no se usaron credenciales del propietario. Alias público confirmado en E y asignación automática desactivada después de promover. Dieciséis comprobaciones públicas confirmaron BUILD_ID, recursos, hashes de las cuatro variantes, límites de acceso y respuestas móviles. Las dos imágenes móviles siguen sumando 46.920 bytes. No se inició sesión como el propietario ni se agregaron datos personales al caché.

F es la primera recuperación compatible con la API móvil y el parche. C (dpl_Hx88KtxSP4uYhoE1Rv8tXBYmdzXi, BUILD_ID c9fa2f8ce4e04beb98aa1224eb811093) y D (dpl_9AwegyxqidGd94x8k98teRsawXQi, BUILD_ID 4a03d120c0e84643b8e770a29c7daa31) publicaron el parche 5d8bed6 anteriormente, pero no ofrecen la API nativa. A/B con Next 16.4.0 son solo historial y no la recuperación de seguridad predeterminada. El frontend c45ee9d no entiende todos los formatos nuevos; nunca volver automáticamente a él o borrar datos para hacer coincidir una interfaz antigua.

Verificación final local: check completo con **514 unitarias**, formato, tipos, lint sin errores (diez avisos existentes) y build. **275 integración**, más repetición final de los cinco casos móviles tras ajustar exclusivamente su guarda de aislamiento. **197 E2E aprobadas y un skip CDP previsto en WebKit**, sin fallos/reintentos, 32,1 minutos. Las 459 pgTAP del esquema siguen vigentes; esta API no añade SQL. Detalle de Expo y límites de distribución en [spec 008](../008-native-app/validation.md). Los commits posteriores al código publicado modifican comandos, pruebas, CI y documentación, sin cambiar el comportamiento web/API verificado de cf38b90.

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
3. B inicial, parche C y API E verificados y promovidos sin recompilar sus respectivos artefactos. Alias público y BUILD_ID confirmados. Asignación automática del dominio desactivada después de promover.
4. Comprobación pública de acceso, offline, manifiesto, iconos, variantes y worker; 200. Rutas privadas sin sesión redirigen 307 a login; su documento de acceso usa no-store. GET de la API de sincronización rechaza método con 405. Ningún dato personal se incorporó al caché.
5. URL HTTPS solicitada en el panel de Codex; la apertura quedó queued y no se declara una prueba autenticada del propietario. F conserva la recuperación compatible, el parche y la API móvil.

El push del parche también terminó antes de trabajos: [39975322226](https://github.com/Domarchi/iron-strength-v2/actions/runs/39975322226), startup_failure; no hay un fallo de tests atribuido a ese run. Evidencia privada adicional: patch-public-verification.json.

La ejecución del código móvil [39978567518](https://github.com/Domarchi/iron-strength-v2/actions/runs/39978567518) también terminó en startup_failure con cero trabajos. No se cambió el CI para ocultarlo. Evidencia adicional privada: native-final-check.log, native-web-e2e-full.log y native-public-verification.json.

Pendientes separados: resolver startup_failure en GitHub y registrar aceptación física Android/iPhone. No se crearon alumnos reales ni se enviaron invitaciones por esta entrega. Evidencia privada en `work/t181-release-20261023/`, fuera de Git; ningún respaldo o secreto se publica.

## Prueba breve después de publicar

Coach en escritorio: abrir una ficha → Adaptar una base → elegir una copia → ajustar una sesión → revisar copias de semanas → revisar alumno/fechas → asignar. Comprobar que el original conserva sus valores. El benchmark automatizado de cuatro semanas homogéneas mide 40 acciones frente a 95 (57,89 % menos); no representa todas las planificaciones posibles.

Cada alumno en móvil, y el coach en su propio entrenamiento: Ver rutina sin iniciar → empezar/retomar → cambiar de ejercicio desde el índice → completar una superserie → revisar pendientes → cerrar → Ver resultado. Probar una prescripción por serie, prioridad de peso indicado y copia explícita de historial sin cambiar series completadas.

En un teléfono con cuenta propia: descargar, cerrar todas las ventanas, modo avión, entrenar, cerrar y reabrir, reconectar y confirmar un solo resultado. Una versión que espera actualizarse debe pedir cerrar las pestañas, conservando el borrador. Seguir [el protocolo físico](../../docs/phone-validation.md); la emulación no acredita estos pasos en Android/iPhone reales. No hay tres alumnos reales creados por esta entrega ni se enviaron invitaciones automáticamente.
