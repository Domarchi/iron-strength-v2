# Publicación de Iron Strength v2

La publicación sigue T165–T166 de `specs/005-complete-training/`. El código local está validado; estos pasos no acreditan un despliegue remoto. No trasladar usuarios, contraseñas, fotos ni entrenamientos de demostración a producción.

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

Auth: registro público cerrado, Email activo, mínimo de ocho caracteres, sin acceso anónimo y Site URL HTTPS del dominio final. La caducidad remota de recuperación sigue en una hora; la ampliación a las 24 horas de RF-7 está pendiente de la confirmación solicitada. También faltan nombre y correo reales para crear el coach y que su propietario establezca la contraseña de forma privada.

La pasada de `81c5f4c` corrigió la hora futura de la semilla y aprobó T158 en ambos motores. Después detectó series anteriores sin orden garantizado al copiar (T150); se canceló CI 39539218053 antes de publicar. La consulta ahora ordena las series explícitamente, con una regresión de integración que reproduce la inversión. La corrección requiere suite completa local y CI final antes de promover.

La validación conserva las comprobaciones de recuperación e idempotencia. Playwright 1.64.1 usa Chromium 156 y WebKit 27.2; el transporte de pruebas controla respuestas perdidas sin permitir que un reintento automático oculte el pendiente. El historial de fallos, correcciones y resultados está en specs/005-complete-training/validation.md.

Despliegue anterior recuperable: `dpl_8qth4AaZtLybxjJXN4ZvF6Wi7xPu`. El dominio público todavía apunta a esa versión. No se revierten migraciones de manera destructiva para volver atrás el frontend.

La aceptación con cuatro cuentas reales y Android/iPhone físicos continúa pendiente. Seguir la guía de teléfonos después del alta del coach y las tres invitaciones reales; registrar dispositivo, navegador y resultado. Una suite emulada aprobada no sustituye esa comprobación.
