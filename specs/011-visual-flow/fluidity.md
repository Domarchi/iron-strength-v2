# Fluidez y accesibilidad de presentación — T231

Medir antes de modificar. Usar recorridos actuales con APIs ficticias, mismos navegadores, viewport/tema y estados al comparar. La geometría se observa después de que exista el contenido confirmado; un botón de salida de una carga no demuestra el layout del resultado. Separar latencia del arnés/Expo web de respuesta nativa: no prometer FPS o aceptación física.

## Recorridos de control

Actualizar datos mientras se busca/edita: conservar contenido válido, campo, valor y foco durante la respuesta retenida y al completarla. Los botones ocupados conservan nombre y área táctil, y no duplican envío. Cambiar pestaña y volver de un detalle conserva posición/selección; abrir/cerrar contexto mantiene registro y término absoluto de descanso. Registrar tiempos observados de apertura/retorno y desplazamientos, sin convertir una muestra de emulación en una garantía de dispositivo.

Revisar a360px con texto normal y al200% en claro/oscuro: Inicio, Cuenta, registro con descanso, biblioteca/edición y progreso/resultado. Detectar contenido fuera del ancho y texto desbordado dentro de contenedores, exceptuando índices con scroll horizontal explícito. No ocultar overflow para silenciar la prueba ni desactivar la escala de texto. Verificar botones/campos con teclado simulado por viewport bajo; la comprobación real del teclado iOS queda registrada aparte en T233.

## Cambios permitidos

Corregir fallos reproducidos mediante composición flexible, estabilidad de claves/elementos y estados de carga consistentes. Reutilizar las transiciones/paneles existentes y respetar movimiento reducido. No añadir librerías, animaciones a cada serie o retrasos artificiales al guardar. Unificar detalles de tipografía/controles donde una diferencia afecte legibilidad, manteniendo el diseño aprobado y tamaños táctiles existentes.

Preservar todos los formatos de borradores, valores numéricos, programas, permisos y guardas. No mover datos de controladores a componentes de presentación para resolver el estilo. Si el defecto solo aparece en el arnés, corregir su espera/oráculo y conservar evidencia, sin atribuirlo a la app.

## Cierre

Especificación → pruebas/mediciones previas → corrección → comparación con mismo arnés → check raíz/móvil y regresión pertinente → commit. Conservar evidencia y límites. No actualizar la demo8087/8091 o base55321 mientras su propietario la prueba. Entrega y prueba física permanecen en T233.
