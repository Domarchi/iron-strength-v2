# Plan — Spec 005

1. T142–144: especificación; operaciones SQL atómicas con revisión e idempotencia; borrador local del coach y resolución de conflictos.
2. T145–148: esquema de grupos/descansos, dominio de rondas, editor, runner y copias profundas.
3. T149–152: consultas paginadas de historial, contexto, alternativas prescritas y ejecución validada en SQL.
4. T153–155: biblioteca, edición múltiple sobre contrato atómico y organización semanal.
5. T156–158: feedback de cierre, seguimiento y periodos comparables.
6. T159–162: paquetes versionados, IndexedDB, shell offline, cola y migración/aislamiento.
7. T163–166: acabado, matriz de pruebas, infraestructura y publicación verificadas.

## Contratos

SessionRow incorpora revision. EditorResult incorpora conflicto/revisión/resultado incierto; cada escritura conserva identificador y payload hasta confirmar. La revisión cambia también por operaciones antiguas para detectar pestañas obsoletas. Registros de operaciones con RLS permiten confirmar reintentos tras modificaciones posteriores.

Los grupos se representan con `superset_id` y descanso común en sus filas de `session_exercises`, con identidad acotada a la sesión y una restricción diferida de tamaño/contigüidad/descanso. Reutilizan RLS y revisión existentes; al quitar un miembro de un grupo de dos, el restante queda independiente.

Extender prescripciones con grupos, descansos, alternativas y día orientativo; extender ejecución con prescrito/realizado, esfuerzo y nota. Nuevos campos opcionales o valores por defecto para datos anteriores. Copias preservan valores y regeneran identidades. Borradores, paquetes y cola versionados; migrar antes de retirar formato antiguo.

## Verificación

Dominio puro, permisos SQL, integración real y E2E incluyendo respuestas perdidas, concurrencia, recuperación, offline y acceso cruzado. No resetear desarrollo. Migraciones aditivas aplicadas sin borrar datos. Publicación solo al proyecto exclusivo documentado, tras verificar identidad y accesos; registrar bloqueos reales sin afirmar despliegues no realizados.
