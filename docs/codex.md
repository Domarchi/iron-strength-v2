# Trabajar con Codex

El proyecto funciona con Codex (OpenAI) sin cambios: Codex lee `AGENTS.md` de la raíz del repo, y ahí están el contexto, los comandos, la estructura, las convenciones y las reglas SDD. `CLAUDE.md` solo contiene `@AGENTS.md`, así que no hay instrucciones duplicadas. Puedes alternar entre Codex y Claude Code sin tocar nada.

## Puesta en marcha

1. Instala la CLI: `npm i -g @openai/codex` (o usa la extensión de VS Code, o Codex web conectado al repo en GitHub).
2. Inicia sesión con tu cuenta de ChatGPT o con una API key. La key va en tu entorno; nunca en el repo ni en un chat.
3. Clona el repo, entra a la raíz y abre Codex.
4. Primer mensaje sugerido:

   > Lee `AGENTS.md`, `docs/constitution.md` y `specs/001-mvp/tasks.md`. Falta cerrar T103 (despliegue en Vercel) y T104 (prueba en móvil y alumnos reales).

## Entorno

- Para `npm run test:int`, `npm run db:test` y `npm run test:e2e` hace falta Docker y `npx supabase start`. Con la CLI local funciona; en Codex web configura un script de setup y comprueba que el entorno tenga Docker. Si no lo tiene, `npm run check` (formato, lint, tipos, unitarias y build) sí corre.
- Variables de entorno (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL`): en local, `.env.local` (copia de `.env.example`, nunca se commitea); en Codex web, la configuración de secretos del entorno.
- Permisos y aprobaciones: modo de aprobación de la CLI o `~/.codex/config.toml`.

## Reglas que viajan en `AGENTS.md`

- La spec manda; una tarea de `tasks.md` por vez, tests primero, commit por tarea (`Tn: <título>`).
- `src/lib/supabase/admin.ts` solo en los tres puntos autorizados.
- Todo cambio de esquema es una migración con RLS y su test pgTAP.
- No se agregan dependencias mayores ni servicios de pago sin aprobación.
- Al terminar: `npm run check` en verde; si tocaste la base, `npx supabase db reset`, `npm run db:test` y `npm run test:int`; si tocaste una pantalla, `npm run test:e2e`.

## Convivencia con Claude Code

- Mantén `AGENTS.md` como única fuente de instrucciones para agentes. Si un agente necesita algo extra, agrégalo ahí, no en archivos paralelos.
- Los commits hechos con Claude Code llevan una línea `Co-Authored-By`; los de Codex no. Es solo atribución.
