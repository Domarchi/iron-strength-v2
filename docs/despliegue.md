# Puesta en producción — pasos que haces tú

Estos pasos usan tus credenciales, por eso no los hago yo. Corresponden a las tareas **T36**, **T103** y **T104** de `specs/001-mvp/tasks.md`. Cada paso termina con una comprobación.

Proyecto de Supabase: `hmkgxhszamktvisrifxv` (cuenta nueva, solo para Iron Strength). **No toques RELEVO ni relevo1.**

## 1. Base de datos (T36)

En una terminal, dentro de la carpeta del proyecto:

```bash
npx supabase login
npx supabase link --project-ref hmkgxhszamktvisrifxv
npx supabase db push --dry-run
```

`--dry-run` solo muestra qué migraciones se aplicarían. Revisa que sean las de `supabase/migrations/` (de `…0009_profiles` a `…0074_save_workout`, más las intermedias). Luego:

```bash
npx supabase db push --include-seed
```

`--include-seed` carga además el catálogo de 467 ejercicios.

**Comprobación:** `npx supabase migration list` muestra las mismas migraciones en local y en remoto. Anota la **región** del proyecto (Settings → General); si no es São Paulo, la latencia desde Chile será algo mayor.

### Ajustes en el panel de Supabase

En **Authentication**:

1. _Sign In / Providers → Email_: deja el proveedor **activado** y **desactiva** "Allow new users to sign up" (el alta es solo por invitación).
2. _Email_: pon la expiración de enlaces/OTP en **86400** segundos (24 h).
3. _Password_: longitud mínima **8**.
4. _URL Configuration → Site URL_: la URL de producción de Vercel (la tendrás en el paso 2).

## 2. Aplicación en Vercel (T103)

1. En Vercel: **Add New → Project**, importa `Domarchi/iron-strength-v2`.
2. Variables de entorno (Production). Los valores salen de Supabase → Settings → API Keys:

   | Variable                               | Valor                                                                  |
   | -------------------------------------- | ---------------------------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`             | `https://hmkgxhszamktvisrifxv.supabase.co`                             |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clave **publicable**                                                   |
   | `SUPABASE_SECRET_KEY`                  | clave **secreta** (nunca con prefijo `NEXT_PUBLIC_`)                   |
   | `NEXT_PUBLIC_SITE_URL`                 | la URL pública de la app, p. ej. `https://iron-strength-v2.vercel.app` |

3. Despliega. Si cambiaste `NEXT_PUBLIC_SITE_URL` después del primer despliegue, vuelve a desplegar.

## 3. Crear tu cuenta de coach (una sola vez)

Crea un archivo `.env.production.local` (está en `.gitignore`) con **las claves de producción** y ejecuta el script. La contraseña la escribes tú; no la pegues en ningún chat.

```bash
# .env.production.local
NEXT_PUBLIC_SUPABASE_URL=https://hmkgxhszamktvisrifxv.supabase.co
SUPABASE_SECRET_KEY=<tu clave secreta>
COACH_EMAIL=tu-correo@ejemplo.cl
COACH_NAME="Tu nombre"
COACH_PASSWORD='<elige una contraseña larga>'
```

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env.production.local scripts/create-coach.ts
```

Después **borra** `.env.production.local` o al menos la línea `COACH_PASSWORD`.

**Comprobación:** abre la URL de producción, inicia sesión con ese correo y entras a "Alumnos".

## 4. Prueba en tu móvil e invitaciones (T104)

1. Desde el móvil, abre la URL, entra como coach e **instálala en la pantalla de inicio** si quieres (la instalación como app es Fase 2; funciona igual desde el navegador).
2. Crea una plantilla de prueba y asígnatela como coach (aparece en "Mi entreno"). Haz una sesión corta, comprueba que se guarda y que el historial la muestra.
3. En **Alumnos**, invita al primer alumno con su correo. Copia el enlace (se muestra una sola vez) y envíaselo.
4. Repite con el segundo alumno.
5. Cuando cada alumno se registre, asígnales su programa.

**Comprobación:** ambos alumnos aparecen en tu lista y, tras su primer entrenamiento, ves su actividad.

## Si algo falla

- _No puedo iniciar sesión en producción_: revisa que el proveedor Email esté activado en Supabase y que el coach exista (paso 3).
- _Las invitaciones no abren_: `NEXT_PUBLIC_SITE_URL` debe ser la URL real, y redeploy.
- _Supabase Free pausa el proyecto tras ~7 días sin uso_: se reactiva desde el panel con un clic.
- Copias de seguridad: el plan gratuito no las incluye; exporta la base de vez en cuando (Settings → Database).
