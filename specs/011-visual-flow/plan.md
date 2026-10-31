# Plan completo: estética y flujo de Iron Strength

## Resultado esperado

Una app móvil sobria, legible y rápida para entrenar, con una planificación web cómoda para el coach. Mejorar lo existente: menos texto permanente, menos contenedores, mejor jerarquía, números claros y cambios de pantalla estables. La referencia de producto es la claridad de Hevy; las interacciones buscan movimiento discreto y con propósito. Se diseñan componentes propios, conservando la identidad Iron Strength.

Negro y grafito en oscuro, fondos neutros en claro y azul reservado para acciones y selección. Tipografía del sistema, cifras tabulares y check circular pequeño con superficie táctil amplia. Sin foto principal generada por IA, decoraciones gratuitas o nuevas funciones fuera del alcance.

## Orden de trabajo

Cada tarea sigue especificación → pruebas pertinentes → implementación → verificación → commit. Se cierra una entrega antes de extender el cambio a otra. Cada entrega visual incluye capturas comparables, cambios realizados y límites de la verificación. No reconstruir binarios, repetir regresiones completas o abrir tareas de infraestructura por una modificación documental.

### Entrega 1 · Referencia y propuesta visual — T224–T225

**T224 · Registrar el punto de partida.** Identificar la versión de la demo y del código; capturar claro/oscuro; medir consultar, comenzar, retomar, completar una ronda, cerrar, crear y editar una rutina. Registrar también el editor web mediante navegación de lectura. Separar mediciones actuales de referencias históricas y del análisis de código. Referencia documentada en [baseline.md](baseline.md).

**T225 · Aprobar una propuesta concreta.** Preparar seis vistas: Inicio, Entrenamiento y Detalle de rutina en claro y oscuro. Añadir los estados de sesión en curso, envío pendiente y error recuperable. Probar botones y navegación del prototipo con datos ficticios, sin conexión a la cuenta ni guardados reales. Entregar un enlace HTTPS que abra en Safari del iPhone y comparaciones antes/después.

**Aceptación:** se entiende la acción principal sin explicación; se distinguen objetivos, valores y acciones; ambos temas resultan legibles desde 360 px. Registrar la aprobación visual y sus ajustes antes de T226–T232. No afirmar que el prototipo es la app nativa implementada.

### Entrega 2 · Fundamentos y componentes — T226

Definir tamaños y pesos de texto, espaciado, color, superficies, radios, iconos y números. Unificar botones, campos, filas de series, menús, paneles, avisos, cargas, errores y estados vacíos. Las ayudas y acciones poco frecuentes pasan al detalle; los problemas que impiden guardar siguen visibles.

**Aceptación:** controles iguales se ven y responden igual en las pantallas intervenidas; contraste AA, foco visible y objetivos táctiles de al menos 44 px, conservando los 48 px existentes. El check mantiene su círculo pequeño. El texto ampliado no recorta valores ni oculta acciones. No se modifica la lógica de almacenamiento o entrenamiento para resolver el estilo.

### Entrega 3 · Inicio, navegación y Cuenta — T227

Inicio prioriza Retomar cuando hay sesión activa; en otro caso, la próxima rutina. Mantener avance semanal y Ver rutina sin iniciar el cronómetro. Agrupar descarga y sincronización con una única presentación por entrenamiento pendiente. Distinguir sin programa, programa futuro, terminado y error.

Conservar Inicio, Entrenar, Historial, Progreso y Cuenta, con títulos y retornos coherentes. Cuenta agrupa apariencia, preferencias de entrenamiento, datos, ayuda y sesión. Claro/Oscuro/Sistema conserva su funcionamiento.

**Aceptación:** retomar en una activación; consultar no crea borrador; cambiar pestaña o tema conserva sesión, valores y descanso. El usuario encuentra pendientes y recuperación sin leer varios avisos equivalentes.

### Entrega 4 · Registro, descanso y cierre — T228

Compactar la cabecera para acercar la primera serie al inicio. Usar una tabla clara de serie, referencia, peso/repeticiones u otro tipo de registro y check. Reducir etiquetas repetidas conservando nombres accesibles. Mantener el ejercicio actual y el índice compacto; las superseries muestran integrantes, ronda y siguiente ejercicio.

Reunir historial, indicaciones, alternativas y herramientas en un contexto consistente. Mantener la copia de valores como acción explícita. El descanso debe ser visible y ajustable sin tapar el teclado o las series. Revisar el cierre con lo realizado/pendiente y esfuerzo/nota opcionales. En el resultado priorizar volver a la semana; agrupar acciones infrecuentes como corregir o eliminar.

**Aceptación:** registrar, desmarcar, pasar de ejercicio, pausar y retomar conserva el estado correcto. Completar calentamientos no avanza una ronda. Recargar no reinicia el descanso. El teclado no cubre el campo ni su acción. Guardado local, pendiente de enviar y confirmado por servidor se distinguen; cerrar no duplica resultados.

### Entrega 5 · Rutinas y biblioteca — T229

Mejorar búsqueda, selección múltiple, vista previa y detalle. Mostrar primero ejercicio, series, repeticiones, peso y descanso; dejar notas y alternativas en un detalle accesible. Conservar selección y posición al abrir un ejercicio y volver. Mantener arrastre, edición por serie y borradores.

**Aceptación:** crear una rutina de cuatro ejercicios sin superar las nueve acciones medidas con el mismo protocolo, salvo cambio necesario documentado. Duplicar conserva prescripciones y genera una copia independiente. No se pierden selecciones al consultar la biblioteca ni cambios al navegar. Los conflictos y guardados inciertos conservan el contenido.

### Entrega 6 · Historial y progreso — T230

Unificar listas, detalle de entrenamiento, gráficas y estados sin datos. Priorizar fecha, rutina y resultados útiles; permitir abrir el entrenamiento que explica una cifra. Conservar ejercicio, periodo, filtros y posición al volver. Las notas y sustituciones siguen consultables sin recargar la pantalla principal de texto.

**Aceptación:** navegar entre resultado, historial y progreso mantiene el contexto. No mostrar comparaciones o tendencias inventadas cuando faltan datos. Corregir un entrenamiento actualiza sus referencias sin cambiar registros históricos ajenos.

### Entrega 7 · Fluidez y respuesta — T231

Medir primero cambios de layout, cargas y renderizados que producen saltos. Mantener contenido válido durante actualizaciones y evitar pantallas vacías intermedias. Reutilizar y ajustar las transiciones existentes: respuesta de pulsación discreta, paneles y retornos coherentes, sin animaciones en cada dato. Preservar foco, teclado y scroll; bloquear doble envío sin ocultar el progreso o el error.

**Aceptación:** cambiar de pestaña, abrir/cerrar un panel y volver de un detalle no pierde posición ni muestra un parpadeo vacío reproducible. La interacción no espera una animación para guardar. Movimiento reducido funciona. Registrar cualquier mejora de rendimiento con dispositivo/entorno y recorrido comparables; no prometer una tasa de fotogramas sin medirla.

### Entrega 8 · Planificación del coach web — T232

Mantener alumno, semana y sesión activos, biblioteca lateral vinculada y estado de guardado visible. Compactar filas y alinear campos frecuentes. Mostrar acciones colectivas al seleccionar ejercicios y detalles al solicitarlos. Facilitar adaptar una base, copiar semanas, revisar y asignar sin perder el alumno de origen.

Antes de afirmar mejoras de pasos, repetir el recorrido completo con una base actual de cuatro semanas en un entorno aislado. El registro histórico T177 sirve de contexto, no como nueva medida. Mostrar claramente qué se conserva y reemplaza; mantener confirmaciones protectoras, guardado explícito y restricciones de semanas activas.

**Aceptación:** adaptar y asignar una copia independiente sin alterar el original; navegar entre semanas conserva borradores y selección. Medir antes/después con el mismo conjunto de ejercicios y cambios, registrar cualquier retroceso y resolverlo o justificarlo. No ejecutar el benchmark destructivo sobre la demo en uso.

### Entrega 9 · Regresión y entrega verificable — T233

Verificar el circuito de coach y tres alumnos de demo, incluido entrenamiento del coach. Cubrir todos los tipos de registro, prescripción por serie, superseries, alternativas, historial, pausa, descanso, cierre, borradores, descarga y sincronización.

Ejecutar `npm run check`, controles móviles y E2E pertinentes en Chromium/WebKit; integración y pgTAP si el cambio realmente afecta esos contratos, siempre en base aislada. Revisar 360/390/420 px, escritorio desde 1280 px, ambos temas, texto ampliado, teclado y movimiento reducido. Probar recarga, desconexión, almacenamiento fallido, sesión expirada y reintentos sin duplicados en los recorridos afectados.

Entregar versión accesible desde el iPhone, capturas antes/después y una guía corta. Probar la versión preparada antes de actualizar el acceso compartido. Conservar la demo anterior y los entrenamientos pendientes hasta coordinar la transición; no reemplazar un bundle mientras hay una sesión activa.

**Aceptación:** diseño aprobado implementado, controles verdes, enlace comprobado y revisión del propietario en su iPhone registrada. Separar explícitamente emulación, Expo Go y binario firmado; la publicación en tiendas no se acredita por aprobar una vista web.

## Qué se conserva y qué queda fuera

Se conservan datos, autenticación/RLS, tipos de registro, objetivos por serie, alternativas, grupos, historial, progresión, recuperación, descargas e idempotencia. No se introducen cambios de esquema/API o dependencias mayores por motivos visuales sin una necesidad demostrada y la decisión correspondiente.

Medidas y fotos siguen en la web, según lo acordado. Nutrición, pagos, comunidad, IA e integraciones nuevas quedan fuera. Las cuentas de Apple/Google, publicación en tiendas, facturación de CI y primer respaldo semanal mantienen sus pendientes anteriores. No bloquean las entregas independientes de este plan ni se consideran resueltos por él.

## Intervenciones del propietario y definición de terminado

Solo se requiere intervención para aprobar la propuesta visual concreta, una decisión nueva de producto, un acceso imprescindible o la comprobación física en el iPhone. No se piden confirmaciones entre correcciones, pruebas y commits rutinarios ya autorizados.

El plan termina cuando T224–T233 están verificadas, la propuesta aprobada está en una versión accesible y la revisión física está registrada con sus incidencias resueltas. No declarar todo terminado con prototipos, tareas parcialmente implementadas o verificaciones pendientes.

## Texto para modo Objetivo

> Completa el plan specs/011-visual-flow de Iron Strength, tareas T224–T233, para mejorar estética y flujo del alumno móvil y la planificación web del coach. Empieza por la referencia y un prototipo accesible en iPhone de Inicio, Entrenamiento y Rutina en claro/oscuro; presenta el resultado y espera mi aprobación visual antes de extenderlo a la app. Después avanza sin confirmaciones rutinarias, con entregas pequeñas y visibles, pruebas pertinentes y commits. Conserva datos, funciones, borradores, descansos y sincronización; protege la demo y su base en uso. No contrates servicios ni reabras cuentas de tiendas como requisito del trabajo visual. Informa del progreso por entregas y conserva los impedimentos reales; no declares completo hasta implementar y verificar el diseño aprobado y registrar mi prueba en iPhone.
