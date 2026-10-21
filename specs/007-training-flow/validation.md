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

## T175

Pruebas primero: contrato ausente en t175-red.log, RPC inexistente en t175-db-red.log y acción anterior parcial en t175-action-red.log. `add_routine_exercises` es security invoker, con revisión, bloqueo programa/sesión, validación SQL del catálogo/capacidad y recibo en routine_mutations. Todas las filas o ninguna; reintento devuelve revisión confirmada sin insertar. No cambia el límite ni la edición de semanas activas.

Selección e intento se guardan en contenido v2 del borrador del coach, conservando lectura v1. Versiones desconocidas o extensiones en un sobre antiguo se preservan. Escritura local exige relectura exacta; si no puede proteger el intento, no se envía. Un conflicto conserva la selección, muestra ejercicios y notas actuales y exige aceptar esa versión antes de iniciar otro intento. Herramientas estructurales bloqueadas mientras hay una petición incierta.

Base aislada reseteada y migraciones aplicadas: **422 pgTAP** (t175-pgtap.log), **256 integración** (t175-integration.log), incluidas reversión en segunda fila, reintento estable, dos pestañas, límite, permiso y semana bloqueada. Tipos generados de la base aislada. Check final **478 unitarias**, formato, lint sin errores, tipos y build (t175-check-final.log). Datos interactivos conservados con la huella de T170. Sin cambios remotos.

Pasada final de editor y accesibilidad: **51 E2E aprobadas y un skip CDP previsto en WebKit**, sin fallos ni reintentos, 6,5 minutos (t175-e2e.log). Los dos casos nuevos comprueban pérdida real de respuesta tras commit, recarga y confirmación sin duplicados; conflicto con selección conservada y nota remota intacta.

## T176

Pruebas previas de sesión activa y conservación de campos (t176-red.log). SessionWorkspace presenta una sesión y conserva montados los demás editores, con navegación por botones/flechas/Home/End y biblioteca vinculada a la activa. La copia de sesión activa el resultado. Cinta de semanas y sesiones identifican cambios pendientes; herramientas muestran su bloqueo. Notas guardadas plegadas, notas locales pendientes visibles al recuperar; alternativas y acciones colectivas mantienen sus controles existentes.

La regresión de arrastre encontró un cambio de altura al iniciar el gesto: los nuevos indicadores contaban `-drag` como borrador e insertaban un aviso sobre la lista. Corregido excluyendo únicamente el estado transitorio de los indicadores, con prueba unitaria específica. Mantiene el bloqueo de herramientas durante el gesto. El helper de mouse centra de forma explícita la lista antes de calcular coordenadas; la prueba CDP táctil real se mantiene. Una expectativa de mensajes se acotó a la sesión visible, conservando además comprobación SQL de los valores guardados en ambas sesiones. Las notas guardadas se consultan abriendo su detalle, de acuerdo con el nuevo comportamiento.

Check final: **480 unitarias**, formato, lint sin errores, tipos y build (t176-check-fixed.log). Datos interactivos conservados con la huella original. Sin cambios de esquema ni producción.

Pasada final: **57 E2E aprobadas y un skip CDP previsto en WebKit**, sin fallos ni reintentos, 6,3 minutos (t176-verified.log). Incluye editor completo, accesibilidad en ambos temas, composición Azul atleta y el caso nuevo de dos borradores entre sesiones/semanas, bloqueo contextual y confirmación SQL de ambos valores.

## T177

Contratos y pruebas previos registrados en planning.md. Fallos iniciales por módulos/RPC ausentes: t177-red.log, t177-int-red.log y t177-db-red.log. Copia múltiple con revisión de pertenencia completa, validación de todos los destinos, transacción y recibo privado. Asignación revisada invoker sobre assign_program, con revisión del origen y programas afectados; serializa asignaciones del mismo alumno y confirma el mismo resultado al reintentar. planning_mutations tiene RLS y cascadas por programa, coach y alumno mencionado. Borrado de cuenta cubierto.

La entrada Adaptar una base conserva el alumno y permite copiar plantillas o programas asignados. Las copias son independientes. Copiar y asignar tienen peticiones locales versionadas, verificación de escritura, protección de salida y aislamiento por programa; conservan desconocidos. La copia exige revisión y confirmación individual de reemplazos. La asignación exige alumno explícito, lunes efectivo, fechas, sesiones y semanas vacías; explica recortes/reemplazos y bloquea reemplazos con entrenamientos.

Base aislada reseteada: **440 pgTAP** (t177-pgtap.log), **264 integración** (t177-integration.log). Se incluyen fallo SQL tardío en segundo destino y reversión del primero, nuevas sesiones que invalidan una revisión, dos intentos de asignación y entrenamiento del propio coach. **484 unitarias** y check en verde. Las diez E2E enfocadas pasaron en Chromium/WebKit (t177-focused-e2e-final.log): alumno desde ficha, adaptación completa, cuota, respuesta perdida con recarga en copia/asignación y conflicto sin cambios parciales.

La interfaz inicial ocultaba el resultado al retirar la petición de un details abierto: corregida apertura independiente y verificada la confirmación visible. Las etiquetas de selectores se hicieron explícitas. El benchmark ejecutado por Chromium registra **40 acciones contra 95 (57,89 % menos)**, con las 72 prescripciones ajustadas, original intacto y grupos/alternativas independientes. Se verifica el mismo objetivo en ambos motores; la comparación se limita a la base homogénea definida antes de implementar en planning.md. Datos interactivos conservados con la huella original. Pasada general final: **179 E2E aprobadas y un skip CDP previsto en WebKit**, sin fallos ni reintentos, 17,5 minutos (t177-e2e-complete.log). Incluye el recorrido desde la ficha a 360 px y accesibilidad, ambos temas, entrenamiento, privacidad de cuatro cuentas, cuota, sesión expirada y sincronización. El check final se conserva en t177-check-complete.log. Evidencia del conteo de ambos motores y su desglose en benchmark.md y benchmark/*.json.

## T178

Pruebas primero de dominio, codecs, SQL y copias (t178-red.log, codec-red, workout-red, int-red y db-red). Extensión JSONB nullable en ejercicios y alternativas, validada con cantidad, rango, precisión y resumen coherente en aplicación y SQL. Escrituras directas del detalle respetan las semanas bloqueadas; las copias autorizadas conservan objetivos y grupos independientes. Mutaciones parciales aplican campos seleccionados a los objetivos actuales, conservando notas y pesos remotos. Payloads antiguos no reciben nuevos campos y confirman el mismo recibo. Listas heterogéneas no generan sugerencia uniforme.

Borrador del coach contenido v3 (lee v1/v2), entrenamiento sobre v3/contenido v2 (lee sobre v2/contenido v1 y legado v1), descarga v2 (lee v1 uniforme). Los lectores rechazan detalles con etiqueta antigua. La migración relee la copia y conserva desconocidos y orígenes modificados. La descarga no reemplaza una versión desconocida o más nueva; la cola congelada conserva su contrato v1. La prueba de cuota encontró un throw asíncrono de IndexedDB que perdía su causa; corregido con aborto controlado, manteniendo la descarga anterior y el mensaje real.

Base aislada reseteada y tipos generados: **459 pgTAP**, **269 integración**. Check completo: **493 unitarias**, formato, lint sin errores, tipos y build. Cobertura: 100 % líneas, 99,8 % sentencias, 100 % funciones y 97,26 % ramas. Logs t178-pgtap-final.log, int-final, check-verified y coverage. Pasada final **75 E2E aprobadas y un skip CDP previsto en WebKit**, sin fallos ni reintentos, 8,7 minutos (t178-e2e-verified.log). Incluye ambos orígenes de borrador con cuota, descargas, cierre de cuenta, editor completo, arrastre, dos pestañas, respuestas perdidas, foco/superseries y sincronización. Huella interactiva idéntica a T170. Sin cambios remotos. La interfaz de detalle sigue en T179.
