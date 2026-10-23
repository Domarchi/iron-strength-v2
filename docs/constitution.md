# Constitución — Iron Strength v2

Principios innegociables. Toda spec, plan y tarea debe cumplirlos.

1. **La spec manda**: no se implementa comportamiento que no esté en la spec activa. Si falta una decisión, se detiene el trabajo y se pregunta. Los cambios empiezan por la spec, no por el código.
2. **Simple y motivante**: la interfaz del alumno prioriza registrar un entreno en pocos toques y mostrar avance. Ante la duda entre más opciones o menos, menos.
3. **Stack fijo**: Next.js (App Router) + TypeScript estricto + Supabase (Postgres, Auth, Storage). Desplegado en Vercel. Todo en planes gratuitos. No se añaden servicios de pago ni dependencias mayores sin aprobación. Excepción aprobada por el propietario el 23 de octubre de 2026: cliente Android/iPhone separado con React Native y Expo, conservando Next.js para planificación web y el mismo Supabase.
4. **La seguridad vive en la base de datos**: cada tabla tiene RLS activada. Un alumno solo ve lo suyo y el coach solo ve a sus alumnos. La UI nunca es la única barrera.
5. **Lógica de dominio pura**: récords, rachas, volumen, progresión y logros viven en módulos TypeScript sin React ni acceso a red, con tests unitarios.
6. **Tests como puerta**: cada tarea termina con lint, tipos y tests en verde. Hay tests de permisos de RLS (coach/alumno) y E2E de los flujos críticos. Prohibido avanzar con algo en rojo.
7. **Migraciones versionadas**: todo cambio de esquema es una migración SQL en el repo. No se toca la base a mano.
8. **Datos personales protegidos**: las fotos y medidas son privadas (bucket privado + URLs firmadas). Nunca se registran en logs ni en analítica.
9. **Idioma**: código e identificadores en inglés; textos de UI y documentación en español de Chile (tuteo). Zona horaria de referencia: America/Santiago.
10. **Documentación viva**: AGENTS.md y la spec reflejan siempre el estado real. Una tarea que cambia el comportamiento actualiza la spec en el mismo commit.
