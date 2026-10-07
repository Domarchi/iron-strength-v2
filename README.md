# Iron Strength v2

App de entrenamiento para un coach y sus alumnos. Desarrollada con Spec-Driven Development: ver `docs/constitution.md` y `specs/001-mvp/`.

## Requisitos

- Node.js 22 o superior y npm
- Docker (para Supabase local)

## Puesta en marcha

```bash
npm install
npx supabase start          # base local: Postgres, Auth y Storage
cp .env.example .env.local  # completa con los valores de `npx supabase status`
npm run dev                 # http://127.0.0.1:3000
```

## Comandos útiles

| Comando                 | Qué hace                                    |
| ----------------------- | ------------------------------------------- |
| `npm run check`         | formato, lint, tipos, tests y build         |
| `npm test`              | tests unitarios (Vitest)                    |
| `npx supabase db reset` | recrea la base local con migraciones y seed |
| `npx supabase test db`  | tests de base de datos y RLS (pgTAP)        |

## Documentación

- `docs/constitution.md`: principios innegociables
- `specs/001-mvp/spec.md`: qué se construye y por qué
- `specs/001-mvp/plan.md`: arquitectura y modelo de datos
- `specs/001-mvp/tasks.md`: tareas y estado de avance
