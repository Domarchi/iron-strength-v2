# Entrega T221 · 29 de octubre de 2026

Estado: web y API publicadas; la distribución en tiendas y la aceptación física continúan pendientes en T201–T205. Esta entrega no las sustituye.

## Versión publicada

- Dirección: https://iron-strength-seven.vercel.app
- Despliegue: `dpl_H5CJ6jePTrp3vzCxfc7GZUEeBJ9s`.
- BUILD_ID: `39dc90df3f9b4d0d8dde6f0d68934c0b`.
- Fuente del artefacto: `5d706f60647aa4b5e73b8c5a97ae397da2e12be5`. Los cambios posteriores de ficha/documentación no cambian la aplicación probada.
- Mismo artefacto production preparado, comprobado y promovido, sin recompilar al promover. Alias público y promoción manual verificados.
- Supabase exclusivo: `udwhjcnlfqlggblnpchu`, 56 migraciones y 29 tablas públicas con RLS.

Incluye rutinas personales y libres, catálogo y ejercicios propios, registro tipado, historial/calendario/progreso, planificación tipada del coach, descarga completa, recuperación y sincronización. La planificación conserva la web; medidas y fotos siguen en web.

## Verificación y límites

La regresión web actual terminó con 429 pruebas aprobadas y una omisión CDP prevista en WebKit. La interfaz móvil terminó con 478 pruebas aprobadas en Chromium y WebKit. Check: 1430 unitarias raíz, 366 móviles, 14 Python, formato/lint/tipos/build; diez avisos raíz anteriores. Base aislada: 1376 pgTAP y 462 integración. Las fases y huellas están diferenciadas en validation.md.

APK quality7: Android emulado de 4 y 16 KiB, sin Metro. Coach y tres alumnos ficticios completaron cuatro entrenamientos y 20 series; métricas, fuentes, sustitución y permisos contrastados con SQL. Bruno y Ana recuperaron cierres sin red y sincronizaron sus payloads congelados exactos; reintentos HTTP sin duplicados. Coach y Carla cerraron con conexión: sus valores se compararon con la evidencia de UI y SQL, sin inventar una cola para esos cierres. Texto al 130 %, tema oscuro, actualización 6→7 sin desinstalar y SQLite anterior conservado. No acredita iOS ejecutado, teléfonos, firma de tiendas o un APK distribuible.

El artefacto protegido pasó 86 controles HTTP y el dominio público otros 86, estos últimos sin credenciales ni bypass de Vercel. Incluyen 73 recursos públicos, worker idéntico y ocho rutas privadas rechazadas. No son una prueba de inicio de sesión del propietario en producción ni sustituyen la beta real.

GitHub Actions 40964257887/40964113233 no inició trabajos por el aviso de pagos/límite de gasto de la cuenta; actionlint aprueba el YAML actual. Se conserva la excepción de publicación con controles locales autorizada anteriormente. No se modificó facturación ni se marcaron checks manuales como exitosos.

## Datos y recuperación

Se generó y restauró la copia nueva `iron-strength-20261029T223001Z-d8791041.tar.gz.gpg`: 57 tablas/682 filas, seis SQL, 40 migraciones de origen, metadatos/RLS y ensayo de las 16 migraciones con rollback. Caduca el 28 de noviembre a las 22:30:01 UTC. Storage estaba vacío; no se afirma haber restaurado bytes de fotos. Justo antes de escribir se volvió a comprobar la identidad, inventarios, esquema, permisos, hashes y dry-run.

Después de aplicar las 16 migraciones se verificaron todas las columnas originales de las 57 tablas, las filas originales del historial de migraciones y las 29 tablas públicas con RLS. Sin reset, semillas, cambio de Vault o copia de cuentas ficticias a producción. La copia es local en F.R.I.D.A.Y., con clave separada en el mismo equipo; no es respaldo externo ni una ejecución semanal programada.

Recuperación compatible: `dpl_GWe59wi4okfgG1c66NzYx2akn34F`, BUILD_ID `44278ebc9b37434483db6c19c73d0876`, fuentes archivadas de `cbb442c9ee28af18ca8e4f60ff351a3ab688e5e5`. Los 1262 blobs coinciden con Git; solo se añadieron exclusiones de empaquetado, vínculo al proyecto y recursos públicos de compatibilidad. Sin metadatos Git inventados. Pasó 87 controles protegidos, incluido el worker público de la versión publicada. Conserva los contratos nuevos con el acabado anterior de gráficos y controles.

No usar N/ef205b5, M, L o K como recuperación transparente después de registrar tipos nuevos: el historial anterior solo representa peso y repeticiones. Recuperar la aplicación no permite revertir migraciones ni eliminar registros. Seguir docs/operations.md y verificar el BUILD_ID tras una recuperación.

## Cómo probar con las cuentas reales

1. El coach entra con su cuenta actual en la dirección pública y prepara una base desde la web. También puede registrar su propio entrenamiento.
2. Preparar las invitaciones de los tres alumnos cuando el propietario indique sus nombres y correos. No se envían mensajes sin autorización ni se inventan credenciales. En la comprobación actual hay un coach y ningún alumno o invitación real.
3. Cada alumno consulta su rutina, registra y cierra, comprueba la confirmación y abre su resultado. El coach revisa la evidencia. Registrar dispositivos y resultados en docs/phone-validation.md.
4. La descarga requiere una entrada previa con conexión. Probar recuperación y sincronización manteniendo los pendientes; no desinstalar para corregir un error.

El cliente móvil nuevo necesita un preview actualizado o Expo Go con el código actual y acceso al backend publicado. El APK quality no se entrega a alumnos. EAS tiene plan gratuito y cupo comprobado; no se contrataron servicios. AAB/IPA finales, formularios, beta, ejecución iOS, teléfonos y publicación efectiva en ambas tiendas conservan sus pendientes propios.

Evidencia técnica privada: `t221-native7-four-accounts-proof.json`, `t221-apply-production-migrations-state.json`, `t221-post-migration-proof.json`, `t221-public-http-state.json`, `t221-compatible-recovery-http-state.json`, `t221-project-after-promotion-proof.json`. Los logs, volcados, SQLite, claves y credenciales no están en Git.

Copia manual posterior terminada: `iron-strength-20261029T232829Z-efed01df.tar.gz.gpg`,66tablas/698filas/56migraciones, cobertura dinámica e inventarios estables. Restauración propia en nueva base privada55322 con datos/metadatos/RLS, roles globales intactos y cero migraciones pendientes; termina23:30:09UTC. No es la primera ejecución semanal programada. Ver docs/backup-restore.md y `work/t221post-restore-sequence-state.json`.
