# Hoja de ruta de Iron Strength para tiendas

La primera versión debe permitir que un alumno entre, entienda su semana, entrene con o sin una conexión disponible tras descarga previa y encuentre un único resultado confirmado. El coach prepara bases y revisa evidencia desde web. Se conserva lo implementado y se completa la diferencia entre plataformas.

## Orden de entregas

| Etapa                     | Tareas    | Entrega y condición de salida                                                                                                                                        |
| ------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Producto               | T189      | Inventario, alcance, recorridos y definición de v1 revisables.                                                                                                       |
| 2. Referencia visual      | T190      | Sistema visual y cuatro pantallas navegables en claro/oscuro, revisadas desde 360 px; referencia pendiente de aceptación del propietario.                            |
| 3. Preparación instalable | T191      | Perfiles locales, identificadores propuestos y guía de requisitos de compilación, sin consumir builds o crear firma.                                                 |
| 4. Acceso completo        | T192–T193 | Invitación y recuperación dentro del recorrido móvil; enlaces seguros y vencidos, renovación y cuenta/eliminación con confirmación.                                  |
| 5. Diseño funcional       | T194      | Extender la referencia aceptada a las pantallas reales, con estados, accesibilidad y adaptación de teclado; conservar registro y recuperación.                       |
| 6. Seguimiento            | T195–T196 | Comentarios nativos y progreso por periodos con enlaces a evidencia. Medidas/fotos privadas existentes se incluyen después de validar su recorrido móvil y permisos. |
| 7. Sin conexión           | T197–T199 | Descarga de semanas, apertura en frío y cola recuperable. Reintentos no duplican; cambios de semana, cuenta y formato no destruyen pendientes.                       |
| 8. Productividad web      | T200      | Medir y corregir fricciones del recorrido existente de adaptar base, copiar, revisar y asignar; no rehacer las operaciones atómicas aprobadas.                       |
| 9. Binarios de prueba     | T201      | Compilar preview Android/iOS y probar sin Metro. Validar cuenta de desarrollador, cuotas, firma y dispositivos antes de construir.                                   |
| 10. Calidad nativa        | T202      | CI operativo, recorridos automatizados nativos, accesibilidad, rendimiento y prueba física del coach y alumnos con evidencia registrada.                             |
| 11. Beta y tiendas        | T203–T204 | Beta, privacidad/soporte/eliminación, capturas, acceso de revisión, compilación final y lanzamiento gradual del artefacto probado.                                   |
| 12. Operación             | T205      | Fallos sin datos personales, alertas útiles, respaldo/restauración ensayados, compatibilidad y procedimiento de actualización/recuperación.                          |

T191 puede prepararse después de la referencia y antes de ampliar funciones. No depende de contratar cuentas. T201 sí depende de acceso del propietario y requisitos de firma; su calendario no se promete mientras eso no esté verificado. La beta requiere datos reales solo de sus propietarios; las demos permanecen identificadas y separadas.

## Cómo se gestiona cada tarea

Cada tarea registra problema, alcance, pantallas, datos, permisos, funcionamiento normal y ante fallos, pruebas, dependencias y criterio de salida. Añadir migración y políticas solo cuando cambie el modelo. Guardar evidencia y separar controles automatizados de aceptación física. Un fallo bloquea la entrega de esa tarea; no ocultarlo ampliando el alcance.

Aprobaciones del propietario: dirección visual completa; decisiones nuevas fuera del alcance; accesos imprescindibles; gastos y envío final. No pedir aprobación para ajustes rutinarios dentro de lo acordado. La revisión visual se apoya en pantallas concretas; no solicitarla con solo una descripción.

## Indicadores de facilidad y calidad

- Retomar desde Inicio en una acción principal una vez autenticado; conservar ejercicio, valores y descanso al volver.
- Consultar rutina sin crear borrador o iniciar tiempo.
- Cierre distingue local, pendiente y confirmado; cero duplicados en pruebas de reintento/respuesta perdida.
- Medir tiempo, acciones y errores de alumnos reales para registrar una sesión. Las metas se afinan con esa línea base; no presentar cifras de laboratorio como resultados de usuarios.
- Adaptar una base de cuatro semanas conservando alumno y original. Comparar con benchmark de spec 007 y mantener sus revisiones obligatorias.
- Controles accesibles, sin desbordamientos a 360 px, texto ampliable y teclado que permite terminar las acciones.
- Lanzamiento sin errores bloqueantes conocidos en acceso, registro, recuperación o separación de cuentas. Recuperación de versiones y respaldo ensayada antes de promoción.
