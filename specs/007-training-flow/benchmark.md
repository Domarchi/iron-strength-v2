# Facilidad de adaptación — T177

Mismo objetivo del protocolo T170: desde el detalle de la base, preparar una copia de cuatro semanas, tres sesiones por semana y seis ejercicios por sesión; cambiar el mismo peso de las 72 prescripciones, revisar y asignar conservando el original. La base tiene estructura, notas y prescripciones iguales entre semanas, como se definió antes de implementar en planning.md. No representa bases con variación semanal intencional.

| Acciones reales del nuevo recorrido                                            | Cantidad |
| ------------------------------------------------------------------------------ | -------: |
| Abrir duplicación, nombrar y crear copia                                       |        3 |
| Elegir sesiones B y C de la primera semana                                     |        2 |
| Editar los 18 pesos de la semana base                                          |       18 |
| Guardar sus tres sesiones                                                      |        3 |
| Abrir copia, elegir tres destinos, revisar, confirmar tres reemplazos y copiar |        9 |
| Abrir asignación con alumno conservado, indicar inicio, revisar y confirmar    |        4 |
| Revisar la semana 2 del resultado asignado                                     |        1 |
| **Total**                                                                      |   **40** |

Referencia: **95**. Reducción: **57,89 %**, superior al objetivo del 30 %. Chromium y WebKit registran el mismo conteo en benchmark/chromium.json y benchmark/webkit.json. E2E cuenta llamadas reales de click, check y fill; no cuenta login, preparación de datos, esperas o desplazamiento, de acuerdo con baseline.md. Las vistas previas y las confirmaciones sí se cuentan.

El test comprueba 72 pesos y notas finales, original sin modificaciones, IDs independientes, doce grupos y doce alternativas conservadas. Integración comprueba también títulos, días, descansos, reversión del lote, bloqueos de semana y reintentos. La auditoría de accesibilidad del resultado forma parte del caso. Estos conteos no equivalen a tiempos medidos con usuarios ni a aceptación en teléfonos físicos.
