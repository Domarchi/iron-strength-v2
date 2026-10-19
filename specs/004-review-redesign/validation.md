# Validación — Correcciones y rediseño

Fecha: 2026-10-19. Rama: `main-54qpxa`.

## Verificado

- `npm run check`: formato, ESLint, TypeScript, **338 pruebas unitarias/de componentes en 33 archivos** y build de producción con Turbopack.
- Regresiones del login: cinco fallos concurrentes compartiendo almacenamiento activan el bloqueo; los fallos en vuelo no reinician ni prolongan un bloqueo activo.
- Regresiones de recuperación: una sesión pasada permite cargar contexto solo para recuperación; las futuras y ajenas siguen bloqueadas. Sin borrador no se inicia una sesión antigua. Con un borrador pendiente se reenvían su id, fecha y duración originales y se elimina el borrador tras el guardado correcto.
- Revisión visual con Chrome y axe sobre los componentes reales renderizados con datos de ejemplo: login, Mi semana, panel del coach y sesión; 360, 375 y 1440 px; claro y oscuro (**24 escenarios**). Sin scroll horizontal ni infracciones WCAG A/AA detectadas en esos estados. No equivale a verificar flujos autenticados contra la base.
- Revisión React: separación de datos y presentación; lecturas de almacenamiento con `useSyncExternalStore`; sin nuevas dependencias; se mantiene la autorización del servidor y la RLS. Se conserva el rol de enlace de Resumen semanal. La etiqueta de Anterior ahora incluye su texto visible.

## Pendiente por entorno

- `npx supabase db reset` y `npm run db:test`: la CLI intenta crear `/home/friday/.supabase`, fuera del área escribible. Además no hay Docker instalado ni una pila local activa. La migración `20261019120086_atomic_login_failures.sql` y sus 11 comprobaciones pgTAP están preparadas, pero no ejecutadas.
- `npm run test:int`: falla en la inicialización por ausencia de `SUPABASE_SECRET_KEY` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Se agregó una regresión de concurrencia con clientes Supabase independientes; no se declara verificada.
- `npm run test:e2e -- --grep 'recupera desde Mi semana'`: compila e inicia el servidor, pero `/login` falla por la clave pública ausente. Se interrumpió la espera; el escenario nuevo no llegó a ejecutarse.

Para cerrar estas validaciones se necesita una pila Supabase local y sus claves en `.env.local`. Luego: reset de base, pgTAP, integración y E2E. Estas suites borran usuarios locales; al terminar se puede restaurar la semilla con `npm run dev:seed`, según AGENTS.md.

La migración debe aplicarse junto con el código del adaptador de login: este usa la función nueva `record_login_failure`. No se han aplicado cambios a una base remota.

## T134 — Revisión inspirada en Hevy

La propuesta clara/verde de T133 fue rechazada por el usuario. Se reemplazó por superficies neutras, acciones azules, tarjetas de rutinas compactas, navegación horizontal en escritorio, secciones de ejercicios sin tarjetas exteriores y filas completadas verdes. Se conservaron los flujos y etiquetas accesibles. La referencia fue la página oficial de registro de Hevy enlazada en la spec.

- Formato, lint, tipos y 338 tests de los mismos 33 archivos vuelven a pasar. El build se completó después de limpiar la caché de Turbopack que conservaba el error de permisos de red del primer intento.
- Contraste calculado para texto, texto secundario, acciones y éxito en claro/oscuro: todos los pares comprobados superan 4,5:1. El mínimo fue 5,32:1. Es una comprobación de tokens, no una auditoría visual completa.
- Se compilaron los componentes reales con datos de ejemplo en una nueva galería local `outputs/hevy-preview.html` (fuera del repo).
- El navegador integrado rechazó abrir la previsualización `file://` por su política de URL. No se usó otro navegador ni una ruta alternativa para abrir ese archivo. La revisión visual y axe de 24 escenarios documentada arriba corresponde a T133, no a T134.
- La suite E2E se volvió a intentar con un límite de espera. Sigue pendiente por la configuración de Supabase local ausente; no se declara el flujo autenticado en verde.
