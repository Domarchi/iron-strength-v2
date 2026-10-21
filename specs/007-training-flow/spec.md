# Spec 007 — Entrenar con menos esfuerzo y planificar más rápido

Plan aprobado por Joaquin el 21 de octubre de 2026. Extiende specs 005 y 006 sin cambiar sus permisos, identidad visual ni reglas de calendario. Primero alumno móvil; después coach web. Una tarea y un commit por vez, con pruebas antes de implementar. Stack y planes gratuitos existentes.

## Alumno

- Inicio prioriza retomar un borrador en curso. Una sesión terminada pendiente de envío se diferencia y aparece una sola vez. Consultar «Ver rutina» no crea borrador ni inicia cronómetro; muestra la sesión vigente y sus indicaciones sin escribir. Recuperación conserva acceso a sesiones antiguas iniciadas. La consulta usa cliente autenticado y RLS, nunca admin.
- Próxima sesión y avance semanal visibles. Descarga y disponibilidad local forman una sección; no se anuncia disponibilidad antes de verificar recursos y datos. Estados sin programa, futuro y terminado enlazan a acciones reales.
- Registro destaca un ejercicio, con índice de nombre, estado y avance de todos. Superserie mantiene visibles sus integrantes y señala ronda/ejercicio siguiente. Cambiar no completa ni modifica series; recargar recupera el ejercicio elegido si sigue pendiente, de lo contrario el siguiente pendiente. Completados pueden abrirse para corregir.
- Cabecera compacta al desplazar; descanso, teclado, Deshacer y acciones no se superponen. Historial, comparación, indicaciones y alternativas comparten panel contextual accesible. Los datos de series, tiempo absoluto y descanso sobreviven a cambios y recarga.
- Cierre muestra realizadas y pendientes, esfuerzo 1–10 y nota opcionales. Estados distintos: copia local, pendiente de enviar, confirmado servidor. Un solo elemento por ID de entrenamiento; reintentos conservan ID/payload. Confirmado ofrece resultado y regreso a semana; solo entonces se afirma que el coach puede verlo.

## Diseño

Conservar Azul atleta y sus contrastes. Aplicar jerarquía consistente a historial, progreso, ficha, cuenta, acceso, Cuerpo y resumen semanal. Selector Claro/Oscuro/Sistema (inicial Sistema) persistente en dispositivo, defensivo ante almacenamiento bloqueado; no mezcla datos personales. Reducir ilustración donde compite con las series. Variantes estáticas optimizadas, tamaños móviles y lista pública/offline cerrada; conservar recursos previos durante transición. Transferencia conjunta móvil de imágenes como máximo 30 % de los 3.306.767 bytes actuales.

## Coach

- Agregado múltiple atómico, idempotente y con revisión. `add_routine_exercises` usa el recibo privado existente y bloquea programa antes de sesión; valida límite y catálogo dentro de SQL. Un reintento confirmado se resuelve antes de comprobar la revisión actual. Selección e IDs de filas se conservan en el borrador del coach, contenido v2 bajo su clave independiente existente. El lector admite v1 uniforme; una escritura v2 se relee antes de retirar el origen sin cambios. Versiones desconocidas se conservan y un cliente anterior no interpreta v2. Si no puede protegerse el intento localmente, no se envía. Congelar IDs/payload por intento; respuesta perdida se reintenta sin duplicar. Conflicto conserva selección y muestra comparación, sin sobrescribir revisión silenciosamente. RLS y límites también en SQL.
- Una sesión activa y biblioteca vinculada. Los editores permanecen montados al cambiar de sesión y semana; los avisos identifican sus borradores. El estado transitorio de arrastre no inserta indicadores ni desplaza la lista. Las pestañas admiten flechas/Home/End; una única sesión no añade navegación redundante. Detalles secundarios plegados y acciones colectivas solo cuando hay selección. Mantener editores montados y sus borradores entre semanas/sesiones; guardado explícito, herramientas bloqueadas con causa y sesión pendiente identificada.
- Adaptar desde plantilla o programa previo crea plantilla independiente. Mantener alumno de origen desde ficha hasta asignación. Copiar semana a varios destinos con vista previa del origen, destinos y reemplazos; todos editables y verificados dentro de una transacción con ID estable y revisiones. Cualquier conflicto/fallo no modifica ningún destino. Reemplazar exige acción explícita. Revisar alumno, lunes efectivo, fechas, sesiones y semanas vacías antes de asignar.
- Plantillas completas editables. En programas activos, solo semanas posteriores a la actual. No modificación automática de cargas ni programas.

## Prescripción por serie

Añadir extensión nullable de lista ordenada a ejercicios y alternativas; `prescribed.series` opcional. Cada serie de trabajo tiene repsMin, repsMax y targetWeightKg nullable. Ausente conserva modo simple y contratos históricos. Cantidad 1–10, reps 1–100, mínimo ≤ máximo, peso 0–500 con precisión actual; cantidad de lista coincide con sets. Descansos siguen por ejercicio/grupo. Calentamientos del alumno no consumen índices de trabajo prescritos.

Todas iguales por defecto. Convertir a Por serie replica cada objetivo; volver con diferencias exige revisar y confirmar los valores uniformes. Peso prescrito por serie prioritario; sin él conserva referencia histórica actual. Repeticiones son objetivo hasta confirmar la serie, nunca evidencia de una realizada. Copiar no cambia completadas. Sugerencia actual solo si las series son uniformes; detalle variable muestra historial/prescripción sin sugerencia uniforme.

Actualizar copias, asignación, alternativas, exportación cuando corresponda, borrado, lectura de contexto y representación. Nuevos borradores/paquetes versionados con lectura compatible y migración confirmada antes de retirar origen. Conservar desconocidos, cola congelada y sesiones iniciadas; descarga nueva no reemplaza entrenamiento en curso. No reinterpretar entrenamientos históricos.

## Seguimiento, seguridad y aceptación

Ficha prioriza programa vigente, último entreno y comentarios; alumno/periodo se conservan al navegar a evidencia, progreso o planificación. No ampliar uso de admin. No cachear HTML privado, APIs, credenciales ni fotos.

Probar consultar sin iniciar, retomar, cambiar, ejecutar superserie y cerrar; preparar cuatro semanas, revisar y asignar copia sin modificar original. Meta de adaptación: ≤66 acciones contra las 95 del protocolo base (reducción ≥30 %). El protocolo y límites de medición están en baseline.md.

Pruebas: check, E2E Chromium/WebKit y accesibilidad por pantalla; integración y pgTAP para esquema/RLS. Respuestas perdidas, dos pestañas, falta de red, almacenamiento lleno, sesión expirada, migración de borradores y paquetes antiguos, aislamiento de cuentas. Base destructiva exclusiva 55321; conservar interactiva 54321 y producción. Verificar proyecto remoto exclusivo, respaldo y migraciones antes de publicar; Staged y promoción del mismo artefacto, despliegue anterior recuperable. Aceptación física separada de emulación.

Fuera: nutrición, pagos, social, IA, importar planillas, correo automático y progresión automática.
