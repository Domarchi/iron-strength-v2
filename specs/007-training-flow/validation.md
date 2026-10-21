# Validación — Spec 007

Estado inicial: tareas pendientes. La implementación no se considera disponible hasta registrar controles y commit por tarea. El código publicado de partida aprobó CI 39611110162 (check, base/integración y E2E); no equivale a pruebas de estas funciones nuevas. Capturas y protocolo previos en baseline.md. Aceptación con teléfonos físicos pendiente.

## T170

Especificación aprobada registrada antes de código, tres referencias visuales previas y protocolo de acciones conservados. `npm run check` en verde: 462 unitarias, formato, lint sin errores, tipos y build; log privado `work/t170-check.log` en directorio padre. Huella de base interactiva idéntica. Sin cambios de pantalla ni esquema. Los conteos base son un inventario reproducible de controles, no una medición cronometrada con usuarios.

## T171

Primero E2E de consulta sin borrador y recuperación del mismo ID; fallo previo por ausencia de Ver rutina (`work/t171-red.log`). Implementada consulta autenticada de la semana vigente con getWorkoutContext/RLS, sin escrituras. Inicio reconoce copia local y distingue retomar de recuperar pendiente; estados vacíos enlazan a programas, historial, progreso o resumen. Consulta accesible con cierre/Escape, retorno de foco, error y reintento.

Check final en verde (462 unitarias, formato, tipos, lint sin errores y build). Cuatro E2E nuevas/enfocadas aprobadas en ambos motores; suite completa final: **149 aprobadas y un skip CDP exclusivo de WebKit, cero fallos y reintentos, 13,4 minutos**. Axe también audita la consulta en ambos temas. Logs fuera de Git: t171-check-final.log, t171-focused.log y t171-e2e.log. Huella interactiva idéntica a T170. Sin cambios de esquema ni producción.

## T172

Pruebas de selección/recuperación escritas antes del helper (fallo por módulo ausente en t172-red.log). Registro con ejercicio destacado, índice accesible persistente al desplazar y bloque conjunto de superserie con ronda/siguiente derivados. La cabecera fija conserva solo controles; métricas se desplazan. Contexto agrupa comparación, alternativas, indicaciones e historial. Cambiar de ejercicio guarda únicamente una preferencia versionada por cuenta/workout (`is:workout-focus:v1`), sin reescribir el borrador o las series de otra pestaña; versiones desconocidas se conservan. Confirmar/descartar registro y limpiar cuenta retiran esa preferencia. No cambia el formato del entrenamiento ni su payload.

Check final: **466 unitarias**, tipos, formato, lint sin errores y build en verde (t172-check-final.log). Pasada de registro/accesibilidad: **48 E2E** en Chromium/WebKit (t172-focused.log). Revisión visual detectó contraste del índice seleccionado; fijado explícitamente. Pasada final con esa corrección: **18 E2E** en ambos motores, cero fallos/reintentos (t172-verified.log): consulta, recuperación, foco con descanso absoluto, tres rondas, apertura offline, cuota, salida y cuatro cuentas. La comprobación geométrica usa desplazamiento programático porque WebKit móvil no admite mouse.wheel; no se omite el caso ni se presenta como gesto físico. Datos interactivos conservados con huella original. Producción sin cambios.

## T173

Pruebas previas de resumen y deduplicación (módulo ausente en t173-red.log). El cierre enumera hechas/pendientes/saltados por ejercicio, conserva valoración opcional y explica que no se completan pendientes. Pendientes unificados por ID, payload de cola prioritario, confirmados excluidos del listado local. Si falla IndexedDB se conserva la presentación del borrador y Revisar envío permite el guardado directo del registro. Semana prioriza el borrador vigente aunque sea otra sesión y no duplica su tarjeta de recuperación; sesiones antiguas siguen accesibles. Estado Pendiente de enviar y mensaje de disponibilidad para coach únicamente tras confirmación del servidor. Resultado añade regreso a Mi semana.

Check: **469 unitarias**, formato, lint sin errores, tipos y build en verde (t173-check-final.log). **38 E2E aprobadas**, Chromium/WebKit sin fallos ni reintentos (t173-verified.log): cierre, rechazo/reintento y una sola fila, IndexedDB no disponible, prioridad de otra sesión, sesión expirada, respuestas perdidas, salida, recuperación antigua, accesibilidad en ambos temas y sincronización offline. Se actualizaron expectativas de texto de pruebas existentes al nuevo estado, conservando todas las verificaciones de ID, fecha, duración, payload y aislamiento. Sin cambios de esquema/producción.

## T174

Pruebas previas de preferencia/almacenamiento y presupuesto de recursos (módulos ausentes en t174-red.log). Azul atleta extendido a historial, progreso, ficha del alumno, Cuenta, acceso, Cuerpo y resumen semanal. Selector Claro/Oscuro/Sistema anterior a hidratación, persistencia defensiva y estado temporal explícito cuando falla la cuota. Sistema es el valor inicial y sigue los cambios del dispositivo; preferencia manual sobrevive recarga. Ilustración más compacta durante el registro.

Conversiones WebP del arte aprobado, originales preservados y listas públicas/offline separadas: 46.920 bytes móviles contra 3.306.767, **98,58 % menos**; todas las variantes offline suman 140.620. Receta y tamaños en assets.md, prueba automática del límite y recursos cerrados. Los PNG siguen públicos para clientes anteriores.

Check final: **472 unitarias**, formato, lint sin errores, tipos y build (t174-check-final.log). Pasada enfocada final: **24 E2E en Chromium/WebKit**, accesibilidad en ambos temas, 360 px, persistencia/cuota, apertura offline y composición visual (t174-focus-final.log). Una pasada anterior encontró contraste insuficiente de +15 en hover en WebKit claro; corregido a #005fd9 y verificado, sin omitir el caso. Huella de datos interactivos idéntica a T170; sin cambios de esquema ni producción.

Regresión completa final: **163 E2E aprobadas y un skip CDP previsto en WebKit**, cero fallos y reintentos, 13,1 minutos (t174-e2e.log).
