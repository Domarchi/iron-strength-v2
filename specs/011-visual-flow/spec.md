# Estética y flujo de Iron Strength

Objetivo: implementar y entregar un acabado profesional, compacto, legible y fluido para alumno móvil/iPhone y coach web. Mantener todas las funciones y datos de specs005–010, incorporando T223 sin interrumpir la prueba actual. La dirección conserva negro/grafito, claro neutro, azul de acción, tipografía del sistema y check circular pequeño. Referencias visuales: claridad de registro Hevy y movimiento con propósito de Emil Kowalski; interfaz y componentes propios.

## Alcance y límites

Esta entrega incluye Inicio, navegación, registro/descanso/cierre, biblioteca/edición de rutinas, historial/progreso, Cuenta y planificación web. No añade nutrición, pagos, comunidad, IA, importación o funcionalidades médicas. Las cuentas y publicaciones de tiendas, facturación CI y primer respaldo semanal siguen en sus entregas anteriores; no bloquean el trabajo visual independiente ni se acreditan aquí.

Preservar autenticación/RLS, todos los tipos de registro, prescripción por serie, calentamientos, superseries, alternativas, pausa, historial, edición, borradores, descargas y cola. Una navegación, tema o animación no recrea sesión, cambia valores, reenvía resultados o reinicia descanso. Mantener identidad y diferencias entre guardado local, pendiente y confirmación del servidor. No fabricar métricas ni ocultar errores/pérdidas de almacenamiento para reducir texto. Sin cambios de esquema/API o dependencias mayores para esta entrega salvo necesidad demostrada y autorización correspondiente.

## Referencia y aprobación

T224 registra fuente real de la demo frente a código integrado, capturas y acciones de recorridos definidos. Cada acción es una activación o edición de campo; no contar letras individuales, acceso inicial, preparación de fixtures o aserciones. Separar medida en interfaz, análisis de código y evidencia histórica. Los recorridos simulados identifican sus fixtures y no prueban la base o el teléfono del propietario. Las medidas del coach deben ser actuales antes de afirmar una reducción de pasos.

T225 presenta Inicio, Entrenamiento y Detalle de rutina en claro/oscuro, estados de activo/pendiente/error y capturas comparativas mediante HTTPS accesible desde iPhone remoto. El prototipo usa datos DEMO y no hace escrituras, peticiones de API o persistencia de cuenta; no equivale a implementación nativa. La aprobación visual del propietario es una puerta explícita antes de T226–T232. Preparar el resultado concreto antes de pedirla; registrar correcciones y referencia aprobada.

Aprobación recibida el 31-oct-2026: «Sí, aplica ese diseño y sigue con el plan completo». Se aprueba la propuesta de docs/design-refresh/proposal y su prototipo de c6621b3, con seis capturas verificadas y los ajustes de simulación ya incluidos. La puerta T225 está cumplida; continuar T226–T233 sin repetir esta pregunta. La revisión física de la implementación final permanece separada.

## Contratos visuales y de flujo

Unificar texto, números tabulares, espacios, superficies, botones, campos, filas, paneles, cargas/errores y estados vacíos. El azul expresa acción/selección; menos bordes y contenedores anidados. Check visible pequeño, objetivo táctil mínimo44px (conservar48donde ya existe), contrasteAA, foco visible, texto ampliado y movimiento reducido.

Inicio prioriza Retomar o próxima rutina, mantiene avance semanal y agrupa disponibilidad/sincronización sin duplicar pendientes. Cinco destinos con propósito: Inicio, Entrenar, Historial, Progreso y Cuenta. En pantallas anchas, la etiqueta al lado del icono mantiene altura natural: medir su contenido nunca debe crear crecimiento de la barra sobre sí misma. Cambiar orientación o escala conserva el contenido visible y los controles dentro de su área táctil. Cuenta agrupa preferencias, datos y sesión; los pendientes reales permanecen accesibles.

Registro compacta cabecera/índice y etiquetas repetidas, conserva objetivo/última ejecución/valores diferentes por serie, foco, posición y término absoluto del descanso. Superserie mantiene miembros y siguiente ronda. Teclado/descanso/acciones no se superponen. Historial, alternativas, indicaciones y herramientas se reúnen de forma consistente; la copia sigue explícita y no modifica series hechas. Cierre distingue lo realizado/pendiente, guardado local, envío y confirmación.

Rutinas: elegir base, selección múltiple, ajuste, revisión y guardado con contexto conservado. Campos frecuentes primero, notas/alternativas en detalle; conservar agrupaciones, orden, teclado, borradores y revisión de conflictos. Historial/progreso/cierre mantienen ejercicio/periodo/posición y evidencia real. No dibujar tendencias sin datos.

Fluidez: etiquetas de navegación ajustan su altura al texto real y vuelven al tamaño habitual al reducirlo; cabecera/descanso y detalle de edición pueden ocupar otra fila sin disminuir la letra ni el área táctil. Diagnosticar carga/re-render/layout antes de cambiar duraciones. Conservar contenido válido al actualizar, respuesta inmediata a acciones frecuentes, gestos predecibles, sin envíos dobles y con movimiento reducido. No animar cada dato o esperar una animación para persistir. En coach conservar semana/sesión/alumno, biblioteca vinculada, acciones colectivas, guardado y revisión; no rediseñar las reglas de edición de programas activos.

## Validación y entrega

Revisar360/390/420px y escritorio desde1280px, ambos temas, texto ampliado, teclado, contraste y movimiento reducido. Retomar en1activación desde Inicio; consultar rutina no inicia el registro. Comparar acciones para rutina de cuatro ejercicios y planificación con la referencia, sin aumentar pasos innecesarios o quitar confirmaciones protectoras. Probar recuperación, superseries, cierre y sincronización; APIs simuladas para UI y base aislada para cambios que realmente la requieran. Nunca resetear55321en uso por la demo ni producción.

Seguir especificación→pruebas pertinentes→implementación→verificación→commit; npm run check y reglas AGENTS. Mantener evidencia de fallos y alcance de cada pasada. No reconstruir binarios por cambios de documentación; exportaciones y vistas previas verificadas según el cambio, regresión final del circuito. Entregar enlace HTTPS, antes/después y guía breve. Mantener la demo anterior hasta coordinar actualización conservando pendientes.

Completo: referencia visual aprobada implementada, recorridos verificados, versión accesible y revisión del propietario en iPhone registrada. Simulación, prototipo, exportación JS o tienda pendiente no se presentan como aceptación física. Solicitar intervención solo para aprobación visual, decisión de producto nueva, resultado físico o acceso imprescindible.

## Corrección de entrada · 2 de noviembre de 2026

El propietario solicita mejorar la intro y primera impresión con referencias Hevy/TeamBuildr y autoriza ejecutar. T234 se define en [entry.md](entry.md): carga, acceso y composición inicial de Inicio, conservando contratos, rutas y datos. Esa petición autoriza la implementación; no reabre la aprobación T225 ni cierra la revisión física T233. La entrega debe ser independiente de la preview8096/3170 en uso.

## T235 · Arranque de Expo Go por túnel

La captura del2-nov informa Failed to load all assets. La petición de bundle retenida en el inspector del túnel contiene x-forwarded-proto duplicado e idéntico; Metro construye una URL inválida y responde500. Reproducción HTTP: la misma ruta sin esa cabecera devuelve200. Corregir en la configuración propia del servidor Metro, sin editar dependencias, interfaz, autenticación o datos. Normalizar únicamente valores http/https coincidentes; devolver400 ante valores vacíos, desconocidos o contradictorios. Conservar middleware previo, Host, ruta, query y otras cabeceras. La comprobación de entrega debe recorrer manifiestos, bundle y recursos en uso, incluyendo solicitudes con cabecera reenviada, y no limitarse a comprobar un GET habitual. Actualizar solo la preview8097 fallida, conservando nombre/slug/ámbito y recursos de comparación. Otros servidores, túnel API y borradores se preservan. La repetición en el iPhone sigue siendo aceptación física independiente.
