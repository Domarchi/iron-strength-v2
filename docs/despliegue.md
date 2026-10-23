# Publicación de Iron Strength v2

La publicación sigue T165–T166 de `specs/005-complete-training/`. El código local está validado; estos pasos no acreditan un despliegue remoto. No trasladar usuarios, contraseñas, fotos ni entrenamientos de demostración a producción.

T181 se publicó el 23 de octubre de 2026: [estado y artefacto de spec 007](../specs/007-training-flow/release.md). El dominio sirve `dpl_7CyiznBLcQZuJWAYE8zKwRVZyX2Z`, BUILD_ID `1750c8e846e94210a27c010bb7720fad`, código be1ac09. Supabase tiene 39 migraciones y conserva sus datos. El propietario instruyó publicar con la validación local completa; GitHub continúa en startup_failure antes de ejecutar CI, pendiente separado. Recuperación compatible: `dpl_7iF5fXeTQCmLhDX3nfcMLz1n6ybj`. No recompilar ni volver al frontend c45ee9d automáticamente.

## Destino y estado comprobado

| Recurso           | Destino previsto / evidencia                                                                | Estado                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Código            | `Domarchi/iron-strength-v2`, rama `main-54qpxa`                                             | Rama subida a GitHub hasta 46bfb7f; 46bfb7f tuvo CI verde con un reintento; repetición 7229aea falló y la corrección de transporte se valida localmente |
| Supabase          | `udwhjcnlfqlggblnpchu`, nombre esperado `iron-strength`                                     | ACTIVE_HEALTHY; respaldo y esquema verificados; 36 migraciones aplicadas                                                                                |
| Vercel encontrado | `iron-strength`, `prj_efHmFcgn3IS5Bd4zzNShwGnewXPd`, equipo `team_NW0l4Vd8UMmxgFbZxPETPMph` | Usuario autorizó reemplazar esa versión por v2 en el mismo proyecto; último despliegue anterior conservado                                              |
| Teléfonos         | Android/Chrome e iPhone/Safari                                                              | Pendiente prueba física por HTTPS                                                                                                                       |

No modificar RELEVO, relevo1 ni el proyecto Supabase `hmkgxhszamktvisrifxv`. El nombre parecido de un proyecto no basta para elegirlo. Antes de cada escritura remota comprobar referencia, equipo, repositorio, commit y entorno.

## 1. Preparar y verificar la base

Autenticarse en una terminal con `npx supabase login`, sin pegar tokens en el chat. Listar los proyectos y confirmar que la referencia exclusiva anterior pertenece a Iron Strength. Después:

```sh
npx supabase link --project-ref udwhjcnlfqlggblnpchu
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

En este hito hay **36 migraciones**, desde `20261007120009_profiles.sql` hasta `20261020120099_offline_workout_sync.sql`. Comparar el listado real del repositorio y el historial remoto; no reparar el historial automáticamente si difiere. Inspeccionar el esquema remoto para confirmar que solo contiene esta app.

Antes de aplicar, completar [respaldo y restauración](backup-restore.md). Aplicar solo las migraciones pendientes, nunca un reset remoto:

```sh
npx supabase db push --linked
npx supabase migration list --linked
```

El catálogo `supabase/seed.sql` contiene ejercicios, no cuentas de prueba. Cargarlo solo si se verificó que falta; revisar el resultado antes de utilizar `--include-seed`. No ejecutar `dev:seed`, `prepare-four-local-accounts.ts`, integración ni E2E contra producción.

Comprobar RLS en todas las tablas públicas, bucket `progress-photos` privado, permisos de fotos por propietario/coach, funciones de escritura y cascadas. La suite local cubre estos contratos, pero no sustituye la comparación con la configuración remota.

## 2. Autenticación y variables

Mantener Email activado y el registro público desactivado. En la configuración local esto significa `[auth] enable_signup=false` y `[auth.email] enable_signup=true`; apagar el proveedor Email impide también entrar a usuarios existentes. Configurar contraseña mínima de ocho caracteres y caducidad de recuperación de 24 horas.

En Supabase, Site URL debe ser la URL HTTPS final. Usar URLs de redirección exactas cuando se necesiten; no añadir comodines de otros proyectos. [Referencia oficial de redirecciones](https://supabase.com/docs/guides/auth/redirect-urls).

| Variable en Vercel                     | Valor requerido                              |
| -------------------------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://udwhjcnlfqlggblnpchu.supabase.co`   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable de ese mismo proyecto       |
| `SUPABASE_SECRET_KEY`                  | Clave solo de servidor, nunca `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL`                 | Origen HTTPS final de Iron Strength v2       |

Configurar secretos directamente en el proveedor, sin publicarlos ni añadirlos a Git. No reutilizar las variables locales ni apuntar previews de pruebas destructivas a producción. Tras cambiar variables públicas, recompilar.

Las invitaciones y la recuperación actuales generan enlaces privados `/invite/<token>` y `/reset/<token>` desde la app del coach. El coach los entrega al alumno; la app no promete envío automático de correo. Comprobar caducidad y un solo uso en el destino final. Si el coach pierde acceso, recuperarlo mediante la administración del proyecto verificado, sin crear otro coach ni cambiar contraseñas existentes por defecto.

## 3. Publicar un commit validado

CI comprueba ambas ramas, formato, lint, tipos, unitarias, build, migraciones, pgTAP, integración, tipos generados y E2E Chromium/WebKit en bases efímeras. Las acciones están fijadas a commits, no conservan credenciales de checkout y solo tienen permiso de lectura. CI no despliega automáticamente.

El destino aprobado es el proyecto existente Vercel `iron-strength`. El enlace local `.vercel/project.json` usa su ID y equipo verificados. Al publicar, vincular el código de v2 y el commit revisado; conservar el despliegue anterior para recuperación. Usar Node 24, Next.js y `npm run build`: ese comando también genera los workers versionados. No sustituirlo por `next build` ni configurar `NEXT_DIST_DIR=.next-interactive` en producción.

Preparar un despliegue de producción sin asignarle aún el dominio, verificarlo y promover ese mismo build. Confirmar HTTPS, login, manifest, iconos, `/offline`, URL del worker y guardado autenticado. Las páginas privadas y APIs no deben incorporarse al caché offline; las fotos usan URLs firmadas de cinco minutos. Mantener los recursos del despliegue anterior durante la transición y comprobar una sesión ya iniciada antes de promocionar; no forzar actualización de workers o recarga con borradores abiertos.

Anotar URL, proyecto, commit, migraciones aplicadas, resultado de los controles y despliegue anterior recuperable. Si falla el frontend, volver al despliegue anterior compatible. No deshacer migraciones destructivamente: detener escrituras si hace falta y preparar una corrección hacia adelante o restauración ensayada.

## 4. Cuatro cuentas y aceptación

Si todavía no existe coach, usar `scripts/create-coach.ts` con variables privadas de producción y credenciales elegidas por su propietario. El script rechaza un segundo coach. No usar la contraseña de demostración.

Entrar como coach, invitar a **tres alumnos**, entregar cada enlace a su destinatario y asignar copias independientes. El coach puede asignarse un programa para entrenar. No enviar invitaciones a direcciones inventadas ni copiar cuentas locales.

Seguir [la guía de teléfonos](phone-validation.md): cada cuenta entra, instala, registra, consulta historial y ve solo sus datos; el coach revisa y responde. Descargar una semana, cerrar, usar modo avión, terminar y reconectar: un solo entrenamiento en el servidor. Verificar recuperación de acceso y dejar los resultados físicos registrados por modelo y navegador.

## Estado de publicación — 21 de octubre de 2026

Destino aprobado: [Iron Strength](https://iron-strength-seven.vercel.app), proyecto Vercel iron-strength (`prj_efHmFcgn3IS5Bd4zzNShwGnewXPd`, equipo `team_NW0l4Vd8UMmxgFbZxPETPMph`). Repositorio conectado: Domarchi/iron-strength-v2, rama main-54qpxa. Node 24 y npm run build; promoción manual, sin autoasignación del dominio.

Supabase exclusivo `udwhjcnlfqlggblnpchu` está ACTIVE_HEALTHY. Antes de escribir se verificaron 23 migraciones previas y se respaldaron roles, esquema, datos e historial en archivos privados fuera de Git, con hashes. El catálogo conserva 467 ejercicios y la huella `26c6a053f291ccfa0946eeb046d7ec0c`; no había usuarios Auth, perfiles, programas, entrenamientos ni objetos de Storage. Las lecturas iniciales durante COMING_UP eran incompletas; se repitió la inspección una vez recuperado el servicio.

Se aplicaron las 13 migraciones pendientes: 36/36 coinciden con el repositorio. No se reparó el historial ni se volvió a sembrar el catálogo. Contrato remoto/local idéntico en 130 columnas, 35 funciones con permisos de ejecución y 48 políticas. Todas las tablas públicas mantienen RLS y progress-photos es privado. No se trasladaron datos de demostración.

Auth: registro público cerrado, Email activo, mínimo de ocho caracteres, sin acceso anónimo y Site URL HTTPS del dominio final. La caducidad remota de recuperación es de 24 horas (86400 segundos), confirmada por el usuario y guardada/verificada en el proveedor Email. Se creó el único coach activo con coach_id propio usando la identidad indicada por su propietario. El enlace privado de un solo uso para definir la contraseña quedó fuera de Git; el propietario completa personalmente el formulario y luego inicia sesión.

La pasada de `81c5f4c` corrigió la hora futura de la semilla y aprobó T158 en ambos motores. Después detectó series anteriores sin orden garantizado al copiar (T150); se canceló CI 39539218053 antes de publicar. La consulta ahora ordena las series explícitamente, con una regresión de integración que reproduce la inversión. La corrección quedó validada por la suite completa local y CI antes de promover.

La validación conserva las comprobaciones de recuperación e idempotencia. Playwright 1.64.1 usa Chromium 156 y WebKit 27.2; el transporte de pruebas controla respuestas perdidas sin permitir que un reintento automático oculte el pendiente. El historial de fallos, correcciones y resultados está en specs/005-complete-training/validation.md.

Publicado el 21 de octubre de 2026: commit `acafce4a0d8fbae8837e3d618c7c16a6f4723cc9`, despliegue `dpl_3yJM97giPeVYPxtWteBQkTEAphz3`, BUILD_ID `ec41f2a47a4c496f9b1103ef21a8a841`. [CI de la versión publicada](https://github.com/Domarchi/iron-strength-v2/actions/runs/39539977730) completo en verde: 458 unitarias, 250 integración, 408 pgTAP, tipos y 141 E2E sin reintentos; seis repeticiones WebKit enfocadas también aprobadas. Suite local completa: 141 E2E sin reintentos. Solo se omite en WebKit el gesto continuo que requiere CDP.

Se promovió el mismo build Staged validado, sin recompilar. El dominio público apunta al despliegue indicado; promoción manual conservada para futuros commits. Verificados por HTTPS login, manifiesto, icono, offline y worker de esta versión (200), páginas privadas redirigidas a login con no-store y ausencia de registros error/fatal en las comprobaciones realizadas. Build generó 58 recursos públicos. Vista previa local del puerto 3000 recompilada con la corrección; datos interactivos idénticos a la referencia anterior.

Despliegue anterior recuperable: `dpl_8qth4AaZtLybxjJXN4ZvF6Wi7xPu`. No se revierten migraciones de manera destructiva para volver atrás el frontend.

La aceptación con cuatro cuentas reales y Android/iPhone físicos continúa pendiente. Seguir la guía de teléfonos después del alta del coach y las tres invitaciones reales; registrar dispositivo, navegador y resultado. Una suite emulada aprobada no sustituye esa comprobación.

## Alta del coach y ajuste de la clave de servidor

Al preparar el acceso se detectó que `projects api-keys` devolvía la clave secreta enmascarada. Esa representación había quedado en la configuración de servidor y producía Invalid API key; la clave publicable sí funcionaba. Se sustituyó por el valor completo obtenido con `npx supabase projects api-keys --project-ref udwhjcnlfqlggblnpchu --reveal --output json`, conservado únicamente en archivos privados fuera de Git y en la variable sensible de producción. No se rotaron claves ni se abrió acceso público nuevo. [Referencia de lectura explícita del secreto](https://supabase.com/docs/reference/api/v1-get-project-api-key).

Antes de desplegar, comprobar que el valor no contiene caracteres de enmascaramiento y que el cliente de servidor puede leer perfiles y Auth administrativo del proyecto exclusivo. Nunca imprimir el archivo de claves ni copiar la representación oculta. La variable `SUPABASE_SECRET_KEY` permanece solo en producción y servidor; no se modifica la clave publicable.

Se recompiló exactamente `acafce4` con la configuración corregida: `dpl_CSsK8f9Vw33veqLniQrRi8emft1V`, BUILD_ID `11698536dd4a4588a78e906f925f44d7`. Prueba de acceso en el build Staged: un correo sintético inexistente recibe el error genérico y registra un solo intento no bloqueado en el control del servidor, sin crear usuarios ni enviar correo. Consola sin errores. Login, offline, manifiesto y worker disponibles; se promovió ese mismo build y se conservó la promoción manual. La versión previa del mismo código permanece recuperable, pero conserva la configuración enmascarada; no usarla para restablecer el acceso.

El alta del coach está verificada en Auth y perfiles: correo confirmado, rol coach, activo y coach_id igual a su ID. El secreto temporal de inicialización se generó en memoria y no se guardó ni comunicó. El enlace de recuperación se generó después de configurar las 24 horas y solo se consume al enviar el formulario. No se inició sesión como el propietario ni se eligió su contraseña final. Todavía faltan el primer acceso del propietario, tres invitaciones reales y la aceptación física.

## Azul atleta — acceso remoto

T169 publicó el código `c45ee9d91ae7bc41538a3ccd0fd9c7dcb8dab9c2` en el mismo dominio HTTPS el 21 de octubre de 2026. Despliegue `dpl_4iyYTpuRF2tp1att8QpsznFRSbuq`, BUILD_ID `5bf53d6932a14802b79959369c5fc8d8`. Verificado en Staged y promovido sin recompilar; el alias apunta a ese ID y se conserva promoción manual. La comprobación pública incluye login, offline, manifiesto, icono, imágenes originales y worker versionado, además de redirecciones a login para rutas privadas. Validación de código: 462 unitarias, 14 integración y 145 E2E Chromium/WebKit, sin fallos ni reintentos; solo el caso CDP se omite en WebKit. Detalles y límites en `specs/006-azul-atleta/validation.md`.

Supabase está saludable, con las mismas 36 migraciones. Se verificaron los hashes del respaldo privado existente; no se aplicaron migraciones ni se modificaron datos o cuentas para este rediseño. Despliegue recuperable anterior: `dpl_CSsK8f9Vw33veqLniQrRi8emft1V`, que conserva la clave real de servidor corregida. La aceptación física y los pendientes humanos de T166 continúan separados de la publicación del frontend.
