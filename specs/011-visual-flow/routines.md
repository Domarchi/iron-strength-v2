# Biblioteca y rutinas — T229

Aplicar el diseño aprobado a la consulta de rutinas asignadas/demo y personales, la biblioteca y la selección/edición. Conservar los contratos, revisiones, peticiones idempotentes, controladores y formatos de borradores. La consulta nunca inicia un registro por sí misma.

## Consulta

Unificar la fila de ejercicio: número y nombre legibles, prescripción y descanso compactos, marca textual de superserie. Mostrar los objetivos distintos por serie; no sustituirlos por una sugerencia uniforme. Notas y alternativas pasan a un detalle explícito, con las etiquetas accesibles de alternativas existentes. La vista personal usa la misma composición y mantiene Empezar/Editar/Retomar con sus guardas actuales. Reducir la cabecera de marca/retorno sin desplazar la acción principal. La alternativa se consulta aquí; su elección durante el registro sigue en el controlador existente.

## Biblioteca y selección

Búsqueda con Input compartido, filtros y filas sobrias. Integrar título y retorno, conservar búsqueda y selección múltiple. Añadir una acción independiente de ficha en cada fila seleccionable, sin anidar botones dentro del checkbox. Abrir información/historial en el panel nativo existente; cerrar o navegar y volver conserva búsqueda, selección y posición de FlatList. Cerrar el panel al perder foco de ruta con un callback estable. No convertir consultar ficha en seleccionar o agregar, ni agregar al volver.

## Editor

Series, repeticiones/métricas, peso y descanso accesibles por defecto. Descanso en una fila compacta propia, con la unidad visible y etiqueta accesible completa. En superseries se indica que rige el descanso de la ronda, editable en la cabecera del grupo; su valor individual para después de separarlo se conserva en el detalle. Abrir detalles directamente en una activación; conservar la acción de menú, duplicación, arrastre/teclado, agrupación y edición múltiple. Notas y modo Por serie permanecen en el detalle; los objetivos distintos conservan su vista explícita. PersonalField adopta Input compartido sin convertir valores durante la escritura o cambiar su persistencia. Selección y herramientas conservan sus restricciones de almacenamiento/revisión/envío.

## Aceptación y prueba

Crear cuatro ejercicios desde Mis rutinas con el mismo protocolo de T224 en nueve acciones o menos (clic/fill individual; acceso previo a la biblioteca excluido). Abrir una ficha es opcional y se cuenta por separado. Contar acciones ejecutadas y verificar la rutina confirmada, no solo un contador de UI.

Verificar consulta sin borrador, detalle explícito, descanso editable sin menú, ficha sin pérdida de selección/filtro/foco y retorno de navegación. Regresión de copias independientes, superseries/arrastre, nueve métricas, objetivos por serie, notas, conflicto, respuesta perdida y almacenamiento lleno. Claro/oscuro desde 360 px y AA en las vistas intervenidas. Check móvil/raíz y exportaciones Hermes con fuentes exactas. No resetear bases, actualizar la demo en uso o crear binarios firmados por estos cambios.
