# Referencia visual y componentes

La referencia continúa el negro, grafito y azul de T188. La tipografía del sistema mantiene familiaridad y permite texto ampliado; el diseño se apoya en jerarquía, contraste y espacio. No introduce fotografías, fuentes externas, una nueva marca ni dependencias visuales.

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

Comprobar ocho combinaciones de vista/tema, ancho móvil 360–390 y editor 1280. Axe para texto/semántica; revisión visual para densidad, agrupación y navegación; comprobación física posterior. Las capturas contienen el indicador DEMO. La aceptación visual del propietario queda pendiente hasta que vea el resultado; no se propaga automáticamente a las pantallas reales.
