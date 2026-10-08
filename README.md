# Iron Strength v2

App de entrenamiento para un coach y sus alumnos: el coach arma programas por semanas, los asigna, ve el progreso y comenta; el alumno registra sus sesiones (con borrador local que resiste cortes de conexión), medidas y fotos privadas, y ve su racha y récords.

Se desarrolló con **Spec-Driven Development**: todo lo que hace la app está en `specs/001-mvp/spec.md` y cada decisión de diseño en `plan.md`. La experiencia móvil (sesión estilo Hevy/Strong, descanso, tira semanal, app instalable) está en `specs/002-mobile-ux/` y la Fase 2 (logros, resumen semanal, comentarios no leídos, exportar CSV y borrar cuenta) en `specs/003-fase2/`.

## Stack

Next.js 16 (App Router) · TypeScript estricto · Supabase (Postgres con RLS, Auth, Storage) · Tailwind + shadcn/ui · Vitest · pgTAP · Playwright.

## Requisitos

- Node.js 24 y npm
- Docker (para Supabase local)

## Puesta en marcha

```bash
npm install
npx supabase start            # base local: Postgres, Auth y Storage (aplica migraciones y seed)
cp .env.example .env.local    # completa con los valores de `npx supabase status -o env`
npm run dev:seed              # coach y 2 alumnos de prueba, con un programa e historial
npm run dev                   # http://127.0.0.1:3000
```

Usuarios de prueba locales (ver `.env.example`): `coach-e2e@test.local`, `alumno1-e2e@test.local`, `alumno2-e2e@test.local`.

## Comandos

| Comando                 | Qué hace                                      |
| ----------------------- | --------------------------------------------- |
| `npm run check`         | formato, lint, tipos, tests unitarios y build |
| `npm test`              | tests unitarios (dominio y utilidades)        |
| `npm run test:int`      | tests de integración contra Supabase local    |
| `npm run db:test`       | tests de base de datos y RLS (pgTAP)          |
| `npm run test:e2e`      | E2E con Playwright (build de producción)      |
| `npm run db:types`      | regenera los tipos TypeScript desde la base   |
| `npx supabase db reset` | recrea la base local con migraciones y seed   |

> Los tests de integración y E2E **borran todos los usuarios locales**: después, vuelve a correr `npm run dev:seed`.

## Estructura

- `src/domain/`: reglas de negocio puras (semanas, cumplimiento, racha, récords, progresión, volumen)
- `src/lib/data/`: acceso a datos con la sesión del usuario (la RLS decide)
- `src/app/`: pantallas y server actions
- `supabase/migrations/`: esquema, RLS y funciones; `supabase/tests/`: pgTAP
- `e2e/`: pruebas de extremo a extremo
- `docs/`: constitución del proyecto y guía de despliegue

## Documentación

- `docs/constitution.md`: principios innegociables
- `specs/001-mvp/`: spec, clarificación, plan, tareas, revisión de seguridad y validación
- `specs/002-mobile-ux/`: spec y tareas de la experiencia móvil
- `specs/003-fase2/`: spec y tareas de la Fase 2
- `docs/despliegue.md`: cómo ponerla en producción
