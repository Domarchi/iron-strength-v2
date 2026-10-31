# Registro, contexto y cierre — T228

Aplicar el registro aprobado al formato tipado actual y al formato legado recuperable. No migrar ni reescribir un borrador para cambiar su aspecto. Conservar los nueve tipos de métricas y los controladores actuales de edición, foco, rondas, pausas, descanso, cierre y cola.

## Cabecera e índice

Cabecera compartida compacta: volver, título, duración/avance, pausa y acceso a revisar el cierre. Mantener los nombres accesibles existentes de acciones. Una única acción Finalizar por pantalla, sin duplicar la del pie. Los estados pendientes siguen mostrando reintento, no un nuevo cierre. Conservar las guardas de pausa, cambios pendientes, almacenamiento no verificado y envío en curso.

El índice conserva todos los ejercicios y su selección persistida. Mostrar los integrantes de una superserie consecutivos con progreso y la siguiente ronda; la finalización y el avance siguen usando el dominio existente. Cambiar de ejercicio no completa series o reinicia el descanso. Cabecera siempre compacta en lugar de introducir una contracción animada que desplace el teclado.

## Tabla de series

Una cabecera de columnas por ejercicio y campos agrupados por serie. Mantener etiquetas accesibles por campo y número de serie; las unidades de entrada siguen siendo las actuales, separadas de la presentación en unidades preferidas. Usar los descriptores existentes para peso, repeticiones, tiempo y distancia. No convertir formatos numéricos durante onChangeText.

Mantener objetivos individuales y referencias anteriores reales. Las prescripciones no uniformes siguen legibles por serie; los calentamientos no reciben por error el objetivo o la ronda de trabajo. La referencia solo copia al tocar y no sobrescribe una serie completada. Adaptar la columna anterior cuando el ancho o la escala de texto no permiten conservar controles de48px: moverla bajo su serie, sin perder la acción o dato. Los tipos de serie, esfuerzo opcional, agregar/quitar y las validaciones existentes permanecen.

Campos y check compactos sobre filas limpias: el estado completado resalta los campos/marca sin convertir toda la sección en un bloque verde. Conservar el círculo de26px dentro del área táctil de48px. En registro normal online a360px, acercar la primera entrada a la parte superior respecto de la referencia T224; verificar un objetivo de y menor a320px, sin usarlo como límite cuando hay errores o texto ampliado.

## Paneles, descanso y cierre

Reunir historial, indicaciones, notas y alternativas en un panel contextual nativo. Las herramientas se abren de forma coherente. Usar Modal/KeyboardAvoidingView/ScrollView del SDK existente, zona segura y movimiento reducido, sin nueva dependencia. Comprobar Escape/volver, foco y lectura modal; el tiempo y el registro permanecen activos al consultar/cerrar. Las notas editadas siguen en el controlador, no únicamente en el estado del panel. Cerrar paneles al perder el foco de la ruta con callbacks estables; no volver a cerrarlos por cada tick del temporizador.

Las acciones antiguas de Detalles y Herramientas mantienen sus etiquetas accesibles, aunque cambie su posición. Las pruebas deben cerrar el panel por su acción de cerrar o Escape: no simular el clic en un disparador que quedó detrás de una ventana modal. Conservar alternativas autorizadas, restricciones tras completar series y los datos prescritos/realizados. La navegación desde historial a un resultado no puede dejar un modal sobre la ruta nueva.

Descanso como hermano del scroll, sin cubrir las series o el teclado; unificar su superficie y acciones sin cambiar el término absoluto. No reemplazarlo por un contador ilustrativo o un setInterval que reinicie al abrir un panel.

Revisar cierre con realizadas/pendientes, esfuerzo/nota opcionales y los mismos valores/recibos. Un panel de revisión no debe ocultar detrás los errores de guardado: mostrarlos en el contexto accesible activo sin duplicarlos. Las etiquetas distinguen guardado local, pendiente y confirmado por servidor. Mantener confirmaciones de descarte y cierre, ausencia de duplicados y recuperación de revisión tras recarga. No afirmar que el coach ve un resultado sin confirmación.

## Verificación

Pruebas previas para cabecera/primer campo, foco/contexto y retorno sin perder valores/resto, series distintas, tipos, alternativas, recuperación y revisión. Regresión sobre los formatos tipado/legado, nueve métricas, calentamientos, pausa, cola, desconexión y almacenamiento fallido. Revisar claro/oscuro,360/390/420px, texto ampliado, objetivos táctiles y AA. Check móvil/raíz y exportaciones Hermes con fuentes exactas; no SQL, reset de55321 o actualización de la demo durante la prueba.

Implementación verificada: cabecera compartida con estado explícito de pausa, columnas adaptables y paneles modales con retorno de foco y cierre al perder la ruta. La presentación posterior del resultado se cierra con T230, junto al historial y el progreso, sin retirar las acciones actuales. La aceptación física y entrega final siguen en T233.
