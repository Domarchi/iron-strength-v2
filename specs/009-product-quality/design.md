# Referencia visual y componentes

La referencia continúa el negro, grafito y azul de T188. La tipografía del sistema mantiene familiaridad y permite texto ampliado; el diseño se apoya en jerarquía, contraste y espacio. No introduce fotografías, fuentes externas, una nueva marca ni dependencias visuales. El propietario aprobó esta base y autorizó extenderla a la app funcional. Pidió conservar una identidad propia, con atención al detalle inspirada en Emil Kowalski, y ajustar el check de las series: circular, pequeño y de trazo fino, con área táctil de 48 px.

## Fundamentos

| Elemento    | Decisión                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| Superficies | Fondo negro 09090b, tarjeta 151517 y elevación 202023; claro f5f5f7, blanco y ededf0.                         |
| Texto       | Principal f5f5f7 o 151518; secundario aaaab3 o 5b5d65.                                                        |
| Acción      | Azul 8cbaff/1559be en texto y selección; botón 185fc4/1559be con texto blanco.                                |
| Bordes      | Separadores discretos; límites de campos más fuertes. No depender del borde tenue para identificar controles. |
| Espacio     | 4, 8, 12, 16, 24 y 32 px; 20 px laterales en móvil.                                                           |
| Tipografía  | Títulos 30–34, secciones 18–20, cuerpo 16, metadatos 13–14. Números tabulares en registro y métricas.         |
| Forma       | Tarjetas de 16–20 px de radio; controles de 12–14 px; selección identificada con texto e icono.               |
| Interacción | Controles de 48 px, foco visible, respuesta de pulsación sin animación de entrada repetitiva.                 |

Estos tokens derivan de mobile/src/lib/appearance.ts. El prototipo los expresa en CSS; al extender la referencia funcional, los componentes nativos siguen siendo React Native y el editor sigue siendo web. No convertir HTML en una pantalla incrustada en la app.

## Pantallas

Inicio destaca Retomar, avance semanal y rutina del día. Las métricas secundarias tienen menor tamaño. La semana distingue realizada, prevista y pendiente mediante texto/icono. La acción principal lleva al entrenamiento de demostración.

Entrenamiento muestra ejercicio actual e índice compacto. Registro directo de kg/repeticiones, objetivo de cada serie y completado accesible. El estado de guardado y la condición DEMO permanecen visibles. Marcar una serie revela descanso de demostración; no representa un temporizador nativo funcional.

Progreso muestra periodo, métrica y gráfico con equivalente textual. Los datos son ficticios y se identifican como DEMO. El producto real calculará tendencias sobre entrenamientos confirmados y ofrecerá acceso a la evidencia; el prototipo no sustituye esa lógica.

Editor del coach prioriza semana y sesión activas, ejercicios y prescripciones; biblioteca lateral vinculada a la sesión. La cabecera expresa que se trata de una plantilla editable. Revisar asignación abre un resumen local, sin asignar o guardar en producción. Arrastre, conflictos, copias y datos reales conservan las operaciones existentes cuando se implemente el diseño.

## Revisión

Prototipo: mobile/public/design-review/index.html, autónomo y sin red externa. Navegación entre cuatro vistas y selector claro/oscuro; estado local en memoria. Los botones de funcionalidades fuera de las cuatro vistas explican su alcance. Ninguna clave, autenticación o almacenamiento de cuenta.

Comprobar ocho combinaciones de vista/tema, ancho móvil 360–390 y editor 1280. Axe para texto/semántica; revisión visual para densidad, agrupación y navegación; comprobación física posterior. Las capturas contienen el indicador DEMO. La base visual está aceptada; la aceptación física de su implementación nativa sigue siendo independiente.

## T194 · Aplicación funcional

El propietario pidió avanzar con el diseño después de aprobar T190; T194 se adelanta a T192–T193 porque no cambia acceso, sesiones o permisos. Invitación y gestión de cuenta continúan pendientes. El editor web se conserva para T200; esta entrega extiende el lenguaje aceptado al cliente nativo existente.

- Inicio conserva el saludo personal, prioriza el registro activo y presenta una siguiente rutina cuando no hay borrador. Avance semanal real y sesiones en filas compactas; no inventar minutos, rachas, calendario o volumen que la API no ofrece.
- Entrenamiento reduce la cabecera y presenta kg/reps en una tabla con números tabulares. Opciones de cada serie siguen disponibles en su número; indicaciones y alternativas se reúnen en detalle explícito. Objetivo por serie visible sin ocultar diferencias. Conservar calentamientos, superseries, descanso absoluto, foco persistente, cierre y reintentos.
- Check: círculo visible de 26 px, icono de 16 px, objetivo táctil 48 × 48 o mayor; seleccionado con marca y color, nombre accesible y estado checked. Mismo acabado en prototipo y app. Respuesta inmediata sin animaciones repetidas o demoras; el movimiento reducido no pierde información.
- Progreso usa únicamente marcas reales actuales, sin dibujar las curvas ficticias del prototipo ni ofrecer periodos no implementados. Historial, consulta de rutina, resultados y cuenta comparten jerarquía y separadores; reducir frases genéricas y contenedores repetidos.
- Mantener contratos, claves de almacenamiento, proveedor y navegación. Ningún cambio de tema o detalle visual vuelve a iniciar un entrenamiento. No se añaden fuentes, imágenes, librerías ni permisos.

Aceptación: consultar sin iniciar, continuar en una acción, cambiar ejercicio sin marcarlo, editar y completar series con check pequeño, recuperar al recargar, conservar temporizador, alternativas y cierre único ante respuesta perdida. Validar claro/oscuro, 360 px, teclado, movimiento reducido, contraste y áreas táctiles en Chromium/WebKit. Exportar Hermes Android/iOS; documentar por separado prueba física.
