# AGENTS.md — Iron Strength v2

## Proyecto

App de entrenamiento para un coach y sus alumnos. El coach diseña programas por semanas, los asigna, ve el progreso y comenta; los alumnos ejecutan sesiones, registran series, medidas y fotos. El coach también entrena (es alumno de sí mismo).

Next.js (App Router) + TypeScript estricto + Supabase (Postgres, Auth, Storage, RLS) + Tailwind + shadcn/ui. La seguridad vive en la base de datos (RLS). La lógica de dominio está en `src/domain/` (TypeScript puro, sin React ni red).

Este proyecto se desarrolla con **Spec-Driven Development**. La fuente de verdad es:
`docs/constitution.md` → `specs/001-mvp/spec.md` → `plan.md` → `tasks.md`.

> Next.js 16 tiene cambios incompatibles con versiones anteriores (p. ej. `middleware` pasó a `proxy`). Ante la duda, lee la guía en `node_modules/next/dist/docs/` antes de escribir código.

## Comandos

- Desarrollo: `npm run dev`
- Todo (formato, lint, tipos, tests, build): `npm run check`
- Tests unitarios: `npm test` (cobertura del dominio: `npm run test:coverage`)
- Base local: `npx supabase start` / `npx supabase stop` / `npx supabase db reset`
- Tests de base de datos (RLS): `npm run db:test`; integración contra Supabase local: `npm run test:int`
- Tipos de la base: `npm run db:types`

Variables de entorno: copia `.env.example` a `.env.local`. Nunca commitees `.env.local`.

## Estilo y convenciones

- Código e identificadores en inglés; textos de UI y documentación en español de Chile (tuteo).
- TypeScript estricto, sin `any`. Validación con zod en `src/domain/schemas.ts`.
- Fechas y semanas siempre en America/Santiago (lunes a domingo). Nunca uses la zona del navegador para decidir la semana.
- Pesos en kilogramos. Componentes de UI con objetivos táctiles de al menos 44 px.

## Reglas

- Lee `docs/constitution.md` y la spec activa antes de tocar código. Si falta una decisión, detente y pregunta.
- La spec manda: un cambio de comportamiento empieza por la spec y se actualiza en el mismo commit.
- Una tarea de `tasks.md` cada vez, **tests primero**. Commit por tarea: `Tn: <título>`.
- `src/lib/supabase/admin.ts` (service role) solo se usa en el servidor y solo en tres puntos: registro por invitación, enlace de restablecimiento y control de intentos de login.
- Todo cambio de esquema es una migración en `supabase/migrations/`. No se modifica la base a mano. Toda tabla nueva lleva RLS y su test pgTAP.
- No agregues dependencias mayores ni servicios de pago sin aprobación.
- Nunca pegues claves ni contraseñas en el chat ni las registres en logs.

## Al terminar cualquier tarea

- Ejecuta `npm run check` desde un estado limpio y confirma que sale con código 0.
- Si tocaste la base: `npx supabase db reset` y `npx supabase test db` en verde.
- Marca la tarea en `tasks.md` y haz el commit.
