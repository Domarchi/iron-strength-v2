# Referencia de uso — T170

Código de partida c45ee9d (publicado), documentación 42ec088. Referencias reales de pruebas aisladas conservadas en baseline/inicio.png, registro.png y editor.png; corresponden a las capturas de T168 previas a esta implementación. No muestran datos de producción. Recursos públicos originales: 2.052.646 + 1.254.121 = 3.306.767 bytes.

## Unidad y protocolo

Una acción es un click/toque, una selección o el llenado completo de un campo; teclear caracteres no cuenta individualmente. No contar login, desplazamiento, esperas ni trabajo de preparar fixtures. Son recorridos de referencia de controles existentes, no tiempos medidos con usuarios reales. Al finalizar se repetirá el mismo objetivo y se registrarán las acciones efectivamente ejecutadas en E2E.

1. Retomar: desde Mi semana con borrador vigente, pulsar Retomar: **1 acción**. Conservar este mínimo; mejorar jerarquía, no añadir confirmación.
2. Superserie: dos ejercicios, tres rondas, sin historial ni carga prescrita. Llenar peso, reps y completar cada serie: 2 × 3 × 3 = **18 acciones**. Cambios de ejercicio automáticos, descanso solo tras ronda. No se exige reducir la entrada necesaria; sí mantener ese máximo y evitar búsqueda/desplazamiento entre tarjetas.
3. Adaptar: desde el detalle de una base ya abierta, duplicar un programa de cuatro semanas, tres sesiones por semana y seis ejercicios por sesión; cambiar un mismo peso en las 72 prescripciones, revisar y asignar a un alumno. Abrir duplicación, llenar nombre y confirmar: 3. Cambiar semanas: 3. Llenar pesos: 72. Guardar las doce sesiones: 12. Abrir asignación, elegir alumno, elegir fecha y asignar: 4. Revisar resultado asignado: 1. Total **95 acciones**. Meta final **≤66**, incluyendo las nuevas revisiones y confirmaciones. El recorrido optimizado puede editar la semana base y copiarla a las otras tres; el resultado debe tener las mismas 72 prescripciones y copias independientes.

La primera referencia no incluye nueva vista previa (aún inexistente); la nueva prueba verificará que abrir/cerrar consulta no crea claves de borrador ni cambia el número de entrenamientos.

Datos interactivos conservados al empezar: huella 91f59c7cb0c45efd96eb0ce57a4e77c68d3c31e6879d8dbc7e6931137cecbf1a. No resetear esta base para tests.
