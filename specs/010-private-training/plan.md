# Implementación

Continuación autorizada por el propietario: entrenamiento y planificación privados, reutilizando los contratos actuales. Una tarea a la vez: especificación y pruebas antes de implementación, comprobaciones en verde, commit y siguiente tarea. Los puntos de tiendas/CI/físicos aplazados no detienen el trabajo local independiente ni se declaran resueltos.

## Orden y dependencias

1. T209 fija inventario, decisiones y evidencia REA. T210 habilita el catálogo real de consulta, sin migraciones.
2. T211 define propiedad/revisión/recibos de rutinas personales en SQL y sus contratos. T212 construye el editor sobre ese modelo; no altera programas del coach.
3. T213 extiende el guardado/registro a origen personal y libre; solo después se muestra el inicio real sin programa. T214 habilita adaptación y repetición sobre esa procedencia.
4. T215 añade tipos de registro, series y notas de forma compatible en SQL/API/borradores/coach. T216 integra herramientas y preferencias con cálculos puros.

   T215 se divide en pasos verificables del mismo alcance: reglas/contratos y validadores SQL; persistencia y lecturas canónicas con permisos; registro/editor nativo y transición protegida de sobres; circuito/regresión. Un contrato preparado no se muestra como función disponible. Conservar los payloads2/anteriores congelados y rechazar documento3 en clientes anteriores. El cierre3 incorpora dimensiones nullable según tipo, esfuerzo y notas propias separadas de prescripción/nota global. La preparación de validadores está verificada localmente; persistencia/lectura/API3 verificadas localmente; núcleo nativo/cliente API3 verificados contra SQL, pero cola3 mixta conectada/verificada. Pantalla/controlador, lectura de resultados y sobre activo4 conectados localmente,270E2E móviles completas aprobadas. Catálogo/ficha2 conectados al móvil con selección múltiple/reemplazo y protección recuperable; repetición3 conectada y verificada desde resultado hasta una copia libre nueva, sin trasladar notas/esfuerzo propios. Prescripción personal nueva y guardar/actualizar base3 siguen pendientes; consumidores avanzados se completan en T218–T220.

5. T217 completa gestión de ejercicios propios. T218 amplía historial, progreso y resúmenes con evidencia real. T219 incorpora las nuevas capacidades al editor/revisión del coach.
6. T220 completa descarga personal/catálogo y migraciones de borradores/cola. T221 realiza regresión integral, comprobación visual/nativa disponible y publicación preparada/promovida del mismo artefacto.

Una tarea que necesite más de un commit puede separar preparación de pruebas de implementación, sin llamar disponible a un control todavía desconectado. Los cambios de API se publican con comprobaciones HTTP y compatibilidad de clientes existentes. No consumir builds EAS, modificar planes de pago o reiniciar túneles del propietario por rutina.

## Seguridad y entornos

Destructivas únicamente en 55321/55322, nunca en la base interactiva 54321 ni en producción. Reinicios/semillas aislados se comprueban antes de crear clientes. Integración y E2E con base compartida se ejecutan en serie. Expo web usa 8083 para conservar Expo Go 8081/8082.

Antes de migraciones remotas: verificar el Supabase exclusivo udwhjcnlfqlggblnpchu, copia nueva cifrada/verificada y restauración aislada, ensayar migración y comprobar RLS/grants/cascadas. No trasladar datos ficticios o reemplazar filas del propietario. La compatibilidad de migraciones precede a la promoción de API.

## Pruebas

Dominio puro: búsqueda, orden/copia, prescripción, rondas, tipos, métricas, discos/calientamiento, unidades y fechas. API: Bearer, validación cerrada, identidad derivada, sin cookies/caché pública y errores sin detalles privados. SQL: permisos entre tres alumnos/coach, atomicidad, revisiones, idempotencia, restricciones directas, borrado/exportación y compatibilidad histórica.

Interfaz: empezar/retomar/repetir, biblioteca y editor, teclado/arrastre, claro/oscuro, 360 px, texto ampliado, respuestas perdidas, recarga, dos ventanas, cuota, sesión expirada, cierre y sincronización única. Chromium y WebKit; Hermes Android/iOS. Emulación, exportación y entrega por túnel son evidencias separadas de aceptación física y publicación en tiendas.
