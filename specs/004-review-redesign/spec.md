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

## Registro fluido y protección del borrador (T137)

Solicitado el 2026-10-19. Amplía RF-22, RF-24, RF-27, RF-50 y RF-53 a RF-60; reemplaza la caducidad automática de borradores y DC-24 (el descanso ahora se conserva).

- Resaltar el ejercicio activo y permitir ir al siguiente ejercicio pendiente. Se mantiene el acceso a todos los ejercicios y el plegado reversible de los completados. Enter en peso lleva a repeticiones; Enter en repeticiones completa una serie válida y avanza al siguiente campo pendiente. Si hay datos inválidos, conserva el foco y explica el error.
- Ofrecer Deshacer para la última serie marcada o eliminada, recuperando sus datos y el descanso anterior. Una edición posterior invalida esa opción para no sobrescribir trabajo nuevo. No se mantiene un historial de deshacer tras recargar.
- Miniaturas SVG propias por patrón reconocible de ejercicio, con alternativa genérica; no se presentan como demostraciones de técnica. Mostrar grupo muscular/equipo desde el catálogo, con jerarquía clara para nombre, prescripción y valores numéricos. Mantener azul/neutros, contraste AA y objetivos de 44 px. Reducir texto secundario con indicaciones desplegables.
- Los borradores válidos del usuario no caducan: solo se eliminan por descarte confirmado o guardado correcto en el servidor. Mi semana permite retomar también los antiguos. Mantener los límites de permisos y recuperación de sesiones pasadas del servidor.
- Guardar y restaurar el descanso mediante su hora de término, incluidos ajustes y cierre; recargar no reinicia la cuenta. Aceptar borradores anteriores sin descanso y conservar las series aunque el dato del descanso esté corrupto.
- Guardar cada cambio del entrenamiento en el dispositivo y mostrar su resultado. Si el almacenamiento falla, avisar que el avance solo sigue en esta página y ofrecer Reintentar. No afirmar que está protegido al fallar también el guardado en el servidor. Mantener el mismo id y fechas para reintentos idempotentes.
- Sin cambios de esquema, dependencias nuevas ni cambios al editor del coach en esta tarea.

## Editor de rutinas del coach (T138)

- Navegar por semanas con un selector compacto; mostrar una semana a la vez, conservando sus ediciones al cambiar. Abrir la semana actual en programas activos y la primera en plantillas. Resumir sesiones, ejercicios y series por semana/sesión.
- Editar series, rango de repeticiones, peso opcional y nota directamente en cada ejercicio. Guardar las prescripciones modificadas con un botón por sesión; validar todo antes del primer envío. Mostrar errores junto al ejercicio, confirmar guardado real y conservar los datos pendientes si falla la red o una operación. El guardado de varias filas usa operaciones individuales: si falla una, informar el avance parcial y reintentar solo las pendientes.
- Mientras haya cambios, impedir operaciones estructurales de esa sesión (agregar, reordenar o quitar) hasta guardar o descartar con confirmación. Avisar al seguir enlaces de la app, cerrar sesión o recargar con ediciones pendientes. Cambiar de semana no descarta nada. El editor no afirma persistencia del borrador tras cerrar la página.
- Agregar varios ejercicios a la sesión desde un catálogo con búsqueda por nombre, músculo y equipo, filtro muscular y selección explícita que se conserva al buscar. Respetar 15 ejercicios por sesión, mostrar los seleccionados y permitir quitarlos antes de confirmar. Los nuevos usan 3 series de 8–12 repeticiones y peso libre; pueden ajustarse inmediatamente. Una incorporación parcial retira de la selección solo los ejercicios agregados y explica el fallo.
- Mantener copia de semanas, asignación y eliminación confirmada; mover herramientas secundarias a desplegables. Mantener las semanas pasadas bloqueadas en UI, acciones de servidor y RLS; las actuales/futuras siguen editables. Sin nuevas dependencias ni cambios de esquema.
- Diseño azul/neutro, campos numéricos legibles, objetivos táctiles de 44 px y sin desbordamiento horizontal a 360 px.

## Cierre E2E (T139)

- Ejecutar la suite Playwright completa sobre el build de producción y Supabase local; corregir regresiones funcionales y de accesibilidad sin relajar los criterios del producto.
- Usar una instancia Supabase exclusiva en `.env.e2e.local`, porque el esquema admite un único coach. No reutilizar servidores de producción de otra ejecución con variables públicas compiladas para una base distinta.
- La limpieza E2E solo puede borrar cuentas del dominio reservado `iron-strength.e2e.test` y sus datos asociados, nunca las cuentas ni programas del desarrollo interactivo. Usar un coach exclusivo de la suite y limpiar los intentos de login únicamente de sus correos. Mantener la barrera de URL local.
- Actualizar selectores obsoletos a los roles/nombres accesibles vigentes; conservar comprobaciones de resultado, guardado real, protección de datos y accesibilidad. Registrar el resultado real, los fallos corregidos y los datos locales conservados.

## Validación

Regresiones de cálculo, edición, selección de descanso, compatibilidad del borrador y conexión de la UI; check completo y E2E cuando el entorno lo permita. No se incorpora código, recursos ni servicios de Hevy al producto.

Pruebas de regresión para concurrencia, permisos SQL y recuperación entre semanas; `npm run check`; migraciones, pgTAP, integración y E2E contra Supabase local cuando Docker esté disponible. Registrar explícitamente las suites que el entorno no permita ejecutar.
