# Spec 004 — Correcciones de revisión y rediseño

Solicitado el 2026-10-19. Amplía las specs 001–003. Dirección inicial: clara y minimalista. El usuario rechazó esa propuesta visual y pidió una interfaz más parecida a Hevy.

## Correcciones

- RF-6: cada fallo de login se cuenta de forma atómica, también si llega junto a otros fallos a instancias distintas del servidor. El quinto fallo bloquea 15 minutos. Los fallos que ya estaban en vuelo no acortan ni prolongan un bloqueo activo. La operación solo se puede ejecutar con `service_role`; nunca expone correos en claro.
- RF-22 y RF-24: una sesión ya iniciada puede recuperarse tras cambiar de semana. La ruta de una sesión antigua permite recuperar un borrador del propio usuario, pero no iniciar una sesión nueva. Mi semana ofrece acceso a los borradores pendientes, incluso de programas anteriores. Un entrenamiento terminado conserva su id, fecha y duración al reintentarlo. El servidor sigue validando la semana de inicio y la RLS.

## Rediseño

- Mantener los flujos, datos, etiquetas accesibles y permisos existentes.
- Referencia: las pantallas oficiales de rutinas y registro de Hevy (`https://www.hevyapp.com/features/track-workouts/`). Se adoptan sus patrones funcionales y densidad; se conserva la identidad Iron Strength.
- Superficies neutras, azul para acciones y verde para series completadas. Temas claro y oscuro según el sistema; bordes discretos y radios pequeños.
- Navegación compacta y títulos de tamaño de aplicación. En móvil se conserva la barra inferior y el modo enfoque durante el entrenamiento; se elimina el aspecto de dashboard con una barra lateral ancha y textos promocionales.
- Mi semana prioriza las rutinas: resumen y calendario compactos seguidos de tarjetas con ejercicios y acción de inicio. La próxima sesión sigue identificada con Hoy toca y no desaparecen las sesiones completadas ni la opción de repetirlas.
- El registro presenta los ejercicios como secciones continuas y filas compactas SERIE / ANTERIOR / KG / REPS / check. Las filas completadas se marcan en verde; la cabecera muestra duración y avance, con Terminar accesible.
- Login directo con formulario, sin eslóganes ni gráficos decorativos. El coach conserva el seguimiento de alumnos con la misma densidad visual.
- Objetivos táctiles de 44 px, contraste AA, sin scroll horizontal desde 360 px y respeto de movimiento reducido.
- Sin dependencias nuevas, servicios de pago ni cambios a las reglas de entrenamiento.

## Registro a partir del análisis estructural de Hevy (T135)

La evidencia y sus límites se registran en `docs/research/hevy-rea.md`. Se implementan componentes propios sobre los contratos de Iron Strength:

- La cabecera del entrenamiento muestra duración, volumen de trabajo en kg y series completadas. El volumen se deriva únicamente de series válidas marcadas, sin calentamientos ni ejercicios saltados, con la regla existente de `setVolume`. Las repeticiones sin carga se muestran aparte; no se suman a los kg. Se recalcula al editar, desmarcar o saltar.
- Cada ejercicio permite elegir su descanso automático de trabajo: desactivado, 30 s, 1 min, 1:30, 2, 3 o 5 min. El valor predeterminado sigue siendo 90 s y el calentamiento sigue en 60 s; desactivarlo también desactiva el descanso tras calentamientos. El cambio afecta al próximo descanso, no al que ya corre. La elección vive en el borrador del dispositivo y sobrevive a recargas; no modifica el programa del coach. Los borradores anteriores siguen siendo válidos.
- Si se edita una serie hecha y el dato deja de ser válido, se desmarca conservando el texto escrito. Una edición válida conserva la marca. Así la confirmación y las series que se guardan coinciden.

## Validación

Regresiones de cálculo, edición, selección de descanso, compatibilidad del borrador y conexión de la UI; check completo y E2E cuando el entorno lo permita. No se incorpora código, recursos ni servicios de Hevy al producto.

Pruebas de regresión para concurrencia, permisos SQL y recuperación entre semanas; `npm run check`; migraciones, pgTAP, integración y E2E contra Supabase local cuando Docker esté disponible. Registrar explícitamente las suites que el entorno no permita ejecutar.
