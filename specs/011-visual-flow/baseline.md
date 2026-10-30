# Referencia anterior al rediseño — T224

Referencia del 30 de octubre de 2026. Código integrado: `9a60876822a9a1ff262222d6051fcf6570e4eeb3`. Demo Expo Go: `0770bf2ceb5bdff8ebf35727658540b7ee769300`. Se contrastaron 87 archivos visuales de componentes y rutas: su contenido coincide. La corrección T223 del controlador de preferencias pertenece al código integrado; todavía no se atribuye a la demo compartida.

## Método y recorridos móviles

Expo web a 390 × 844 px, Chromium y WebKit, claro y oscuro. APIs simuladas con fixtures existentes de descarga semanal y biblioteca tipada, fecha fija del 24 de octubre. Toda salida de red ajena al servidor local fue bloqueada. No se ejecutaron escrituras reales de entrenamientos ni modificaciones de la base de la demo.

Cada activación, selección o edición de un campo cuenta una acción. No se cuentan letras, acceso inicial, preparación, esperas, capturas ni desplazamiento. Los cuatro conjuntos navegador/tema obtuvieron los mismos conteos:

| Recorrido                                                                | Acciones actuales | Condición que se debe conservar                                      |
| ------------------------------------------------------------------------ | ----------------: | -------------------------------------------------------------------- |
| Consultar rutina desde Inicio                                            |                 1 | No crea borrador ni inicia cronómetro                                |
| Comenzar desde Inicio, incluida la consulta                              |                 2 | El comienzo sigue siendo explícito                                   |
| Retomar desde Inicio                                                     |                 1 | Recupera el entrenamiento existente                                  |
| Completar ronda de dos ejercicios, editando peso y repeticiones de ambos |                 6 | Cuatro ediciones y dos checks; avance automático sin abrir el índice |
| Cerrar y llegar al resultado                                             |                 2 | Finalizar y confirmar; el resultado ya se abre directamente          |
| Crear rutina de cuatro ejercicios desde la biblioteca                    |                 9 | Nombre, selección múltiple y guardado explícito                      |
| Renombrar rutina desde la biblioteca                                     |                 4 | Abrir, editar, cambiar nombre y guardar                              |

El primer campo del registro tiene 48 px de alto y aparece a 354 px desde el borde superior. En la primera pantalla se contaron 58 palabras en Inicio, 57 en rutina y 55 en registro; son medidas de texto DOM visible con datos fijos, no una evaluación cognitiva o de tipografía nativa. Las capturas no presentan desbordamiento horizontal a 390 px. El rediseño aún debe comprobar 360/420 px, texto ampliado y teclado físico.

## Coach: referencia actual y límite histórico

Octavo recorrido: abrir Semana 2 y Sesión B desde el programa de demo, dos activaciones. Se capturó el editor a 1440 × 1000 px. Después del acceso normal se bloquearon peticiones distintas de GET/HEAD: cero intentos de escritura durante esta navegación. No se copiaron semanas, guardaron prescripciones o asignaron programas en la base compartida.

El recorrido completo de adaptación actual no está medido aquí. [T177](../007-training-flow/benchmark.md) documentó 40 acciones frente a 95 para cuatro semanas homogéneas; esa referencia es histórica y no una nueva medición con los tipos actuales. T232 debe obtener una referencia actual equivalente en un entorno aislado antes de afirmar una reducción de pasos.

## Oportunidades observadas

- La cabecera, el retorno, el estado de guardado y el índice retrasan la primera serie. Compactarlos conservando información de recuperación.
- Las etiquetas de objetivo y campos se repiten en cada serie. Revisar la jerarquía de tabla sin reducir la superficie táctil ni perder nombres accesibles.
- Ya existen ejercicio activo, avance automático de superserie y transiciones de navegación. Mejorar densidad y estabilidad antes de añadir controles o animaciones.
- El resultado ya aparece tras confirmar. Su conjunto de acciones grandes compite por atención: priorizar el siguiente paso y agrupar acciones infrecuentes.
- El editor web ya mantiene biblioteca lateral y guardado visible. Mejorar alineación y densidad conservando contexto, reglas y borradores.

## Capturas y evidencia

Las doce imágenes originales y sus huellas están en [el manifiesto de referencia](../../docs/design-refresh/baseline/capture.json). Las móviles proceden de WebKit con datos ficticios; las de coach, de navegación de lectura sobre la demo. Son el estado anterior, no propuestas aprobadas.

- [Inicio oscuro](../../docs/design-refresh/baseline/dark-home.png) y [claro](../../docs/design-refresh/baseline/light-home.png).
- [Rutina oscura](../../docs/design-refresh/baseline/dark-routine.png) y [clara](../../docs/design-refresh/baseline/light-routine.png).
- [Registro oscuro](../../docs/design-refresh/baseline/dark-workout.png) y [claro](../../docs/design-refresh/baseline/light-workout.png).
- [Resultado oscuro](../../docs/design-refresh/baseline/dark-confirmed.png) y [claro](../../docs/design-refresh/baseline/light-confirmed.png).
- [Editor personal oscuro](../../docs/design-refresh/baseline/dark-personal-editor.png) y [claro](../../docs/design-refresh/baseline/light-personal-editor.png).
- [Coach semana actual](../../docs/design-refresh/baseline/coach-current-week.png) y [sesión futura](../../docs/design-refresh/baseline/coach-future-session.png).

La segunda pasada del colector aprobó sus ocho pruebas en 38,1 s. La primera se detuvo por un selector que suponía varios campos montados tras el avance automático; se corrigió el colector para seguir el ejercicio activo. Ese fallo se conserva como error del instrumento, sin atribuirlo al producto ni acreditar la primera pasada. Evidencia privada fuera de Git: `t224-baseline-second.log`, `t224-baseline-evidence` y `t224-baseline-source-proof-private.json`.

No se acredita aceptación física, comportamiento de SQLite nativo, rendimiento en iPhone o prueba completa de asignación del coach con estas capturas.
