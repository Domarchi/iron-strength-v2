# Validación — Correcciones y rediseño

Fecha: 2026-10-19. Rama: `main-54qpxa`.

Actualización T136: Supabase local ya está operativo mediante el runtime nativo. Las limitaciones históricas de claves, migraciones, pgTAP e integración descritas abajo quedaron resueltas; consultar la última sección y `docs/local-development.md`. La suite automatizada de Playwright sigue pendiente.

## Verificado

- `npm run check`: formato, ESLint, TypeScript, **338 pruebas unitarias/de componentes en 33 archivos** y build de producción con Turbopack.
- Regresiones del login: cinco fallos concurrentes compartiendo almacenamiento activan el bloqueo; los fallos en vuelo no reinician ni prolongan un bloqueo activo.
- Regresiones de recuperación: una sesión pasada permite cargar contexto solo para recuperación; las futuras y ajenas siguen bloqueadas. Sin borrador no se inicia una sesión antigua. Con un borrador pendiente se reenvían su id, fecha y duración originales y se elimina el borrador tras el guardado correcto.
- Revisión visual con Chrome y axe sobre los componentes reales renderizados con datos de ejemplo: login, Mi semana, panel del coach y sesión; 360, 375 y 1440 px; claro y oscuro (**24 escenarios**). Sin scroll horizontal ni infracciones WCAG A/AA detectadas en esos estados. No equivale a verificar flujos autenticados contra la base.
- Revisión React: separación de datos y presentación; lecturas de almacenamiento con `useSyncExternalStore`; sin nuevas dependencias; se mantiene la autorización del servidor y la RLS. Se conserva el rol de enlace de Resumen semanal. La etiqueta de Anterior ahora incluye su texto visible.

## Pendiente por entorno

- `npx supabase db reset` y `npm run db:test`: la CLI intenta crear `/home/friday/.supabase`, fuera del área escribible. Además no hay Docker instalado ni una pila local activa. La migración `20261019120086_atomic_login_failures.sql` y sus 11 comprobaciones pgTAP están preparadas, pero no ejecutadas.
- `npm run test:int`: falla en la inicialización por ausencia de `SUPABASE_SECRET_KEY` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Se agregó una regresión de concurrencia con clientes Supabase independientes; no se declara verificada.
- `npm run test:e2e -- --grep 'recupera desde Mi semana'`: compila e inicia el servidor, pero `/login` falla por la clave pública ausente. Se interrumpió la espera; el escenario nuevo no llegó a ejecutarse.

Para cerrar estas validaciones se necesita una pila Supabase local y sus claves en `.env.local`. Luego: reset de base, pgTAP, integración y E2E. Estas suites borran usuarios locales; al terminar se puede restaurar la semilla con `npm run dev:seed`, según AGENTS.md.

La migración debe aplicarse junto con el código del adaptador de login: este usa la función nueva `record_login_failure`. No se han aplicado cambios a una base remota.

## T134 — Revisión inspirada en Hevy

La propuesta clara/verde de T133 fue rechazada por el usuario. Se reemplazó por superficies neutras, acciones azules, tarjetas de rutinas compactas, navegación horizontal en escritorio, secciones de ejercicios sin tarjetas exteriores y filas completadas verdes. Se conservaron los flujos y etiquetas accesibles. La referencia fue la página oficial de registro de Hevy enlazada en la spec.

- Formato, lint, tipos y 338 tests de los mismos 33 archivos vuelven a pasar. El build se completó después de limpiar la caché de Turbopack que conservaba el error de permisos de red del primer intento.
- Contraste calculado para texto, texto secundario, acciones y éxito en claro/oscuro: todos los pares comprobados superan 4,5:1. El mínimo fue 5,32:1. Es una comprobación de tokens, no una auditoría visual completa.
- Se compilaron los componentes reales con datos de ejemplo en una nueva galería local `outputs/hevy-preview.html` (fuera del repo).
- El navegador integrado rechazó abrir la previsualización `file://` por su política de URL. No se usó otro navegador ni una ruta alternativa para abrir ese archivo. La revisión visual y axe de 24 escenarios documentada arriba corresponde a T133, no a T134.
- La suite E2E se volvió a intentar con un límite de espera. Sigue pendiente por la configuración de Supabase local ausente; no se declara el flujo autenticado en verde.

## T135 — Análisis REA y registro por ejercicio

- REA `rea-agents@6.7.0` ejecutado mediante CLI local, sin registrar un MCP ni cambiar la configuración del agente. Dos pasadas sobre siete archivos seleccionados del cliente web público de Hevy, sin ejecutar los bundles. El informe `docs/research/hevy-rea.md` conserva IDs de evidencia, identidad del inventario, rutas, hashes, observaciones y límites. No se analizó el binario móvil ni el servidor.
- Pruebas nuevas ejecutadas primero en rojo: volumen, edición inválida de series hechas, selección de descanso y compatibilidad/persistencia del borrador. Tras implementar, pasan las 11 regresiones nuevas y una prueba adicional con la UI real en jsdom que verifica selección, marcar/desmarcar, volumen y restauración de la sesión.
- `npm run check` completo en verde: **350 tests en 35 archivos**, formato, ESLint, TypeScript y build de producción. Revisión adicional de React y del diff sin hallazgos accionables: cálculos derivados sin efectos, selección controlada y etiquetas accesibles, sin dependencias nuevas en la app ni cambios a la base.
- E2E nuevo en `e2e/sesion-movil.spec.ts`, con descanso elegido, volumen, edición inválida y recarga. El intento se hizo con límite de 35 s; el servidor compila, pero `/login` falla por `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ausente. No llegó a ejecutar el escenario autenticado. Un primer intento coincidió con el build del check y fue rechazado por el bloqueo de Next; se repitió una vez terminado ese build.
- La galería ilustrativa `outputs/hevy-preview.html` de la carpeta padre se regeneró con los componentes actuales. Se mantiene la limitación de inspección visual del navegador documentada en T134; no se considera una auditoría visual o axe del estado T135.

## T136 — Supabase local y flujo autenticado

- CLI 2.120.0, runtime nativo oficial para Linux. Se conserva `supabase/config.toml` y se usan variables de entorno para el modo stack y para desactivar Storage vector. Servicios de la app: base, Auth, REST, Storage y Realtime; además Studio y correo de prueba. El supervisor local mantiene los procesos activos y los archivos viven fuera del repo, en `work/supabase-home` de la carpeta padre.
- Se aplicaron todas las migraciones, se hizo reset local y se ejecutaron **272 comprobaciones SQL/pgTAP en 17 archivos**: todas pasan. La migración `20261019120086_atomic_login_failures.sql` y sus 11 comprobaciones ya se ejecutaron correctamente.
- **204 pruebas de integración en 25 archivos** pasan contra la API local. Después se restauró la semilla de desarrollo: coach, dos alumnos, programa e historial del primer alumno.
- `npm run check` vuelve a pasar completo: **350 pruebas en 35 archivos**, formato, lint, tipos y build.
- Verificación manual en el navegador integrado contra la app real de Next: login como alumno; programa de la semana; marcar una serie con descanso de 120 s y volumen de 600 kg; editar repeticiones a 0 desmarca la serie y devuelve el volumen a 0; restaurar 10 repeticiones, marcar y finalizar guarda el entrenamiento y muestra su detalle. Una consulta REST independiente confirmó una serie de 60 kg × 10 en la base.
- Login como coach: dos alumnos visibles, y Alumno Uno con 1 de 2 sesiones cumplidas. Se vuelve a dejar la sesión del alumno abierta para pruebas manuales.
- La inspección visual ahora se realizó sobre esas pantallas autenticadas. No equivale a una auditoría completa de todas las vistas, todos los tamaños o axe. La suite automatizada de Playwright no se ejecutó en esta configuración.

## T137 — Registro, detalle visual y protección de borradores

- Pruebas de regresión primero en rojo: borrador en curso de hace 60 días, acceso desde Mi semana, descanso restaurado, deshacer y fallo de almacenamiento. Se añadieron además teclado válido/inválido, restauración del descanso anterior al deshacer y metadata real del catálogo. El descanso corrupto se ignora sin perder las series; siguen funcionando los borradores anteriores.
- `npm run check` completo en verde: **359 pruebas en 36 archivos**, formato, ESLint, TypeScript y build de producción. No se cambiaron esquema, RLS ni dependencias. La revisión React comprobó estado derivado, eventos de teclado, escrituras inmediatas, suscripción al resultado real de guardado y limpieza de listeners.
- Verificación manual mediante el navegador integrado, con Alumno Uno y la sesión B contra Supabase local: Enter de peso a repeticiones y de repeticiones a la siguiente serie; 70 kg × 10 produce 700 kg; deshacer desmarca y restaura el descanso previo; quitar y deshacer recupera la misma serie con 70 kg y 10 repeticiones. Siguiente cambia el ejercicio activo y enfoca su primer campo.
- Se ajustó el descanso y se recargó: la cuenta pasó de 2:01 a 2:00, sin reiniciarse; se conservaron la serie, sus valores y el volumen. Tras agotarse, una nueva recarga muestra Descanso terminado. Guardado en este dispositivo refleja el resultado de localStorage; las pruebas cubren fallo por cuota y reintento correcto.
- Revisión visual real en escritorio y a 360 × 800: sin scroll horizontal; ninguno de los botones, inputs, selectores o summary visibles medidos fue menor a 44 × 44 px. Miniaturas SVG propias, grupo/equipo del catálogo y números mayores. No se declara una auditoría axe completa ni validación de todas las vistas/temas.
- `npm run test:e2e -- --list` reconoce los **33 escenarios en 7 archivos**, incluido T137. Solo se validó el descubrimiento de la suite. La ejecución completa de Playwright queda pendiente; las interacciones de navegador se hicieron por el canal integrado de control de UI. No se usó un navegador alternativo ni se borraron los datos locales para esta comprobación.
- Capturas de esta revisión en `outputs/registro-movil.jpg` y `outputs/registro-actualizado.jpg`, en la carpeta padre del repo. Se deja la app real abierta con una sesión en curso para pruebas del usuario.

## T138 — Editor de rutinas del coach

- Spec y tarea escritas antes del código; primera ejecución de las regresiones en rojo por los módulos pendientes. Se añaden 13 pruebas: validación completa del lote (incluido rango invertido), IDs ajenos, límite de capacidad, fallos parciales/inesperados, búsquedas sin tildes, conservación de ediciones entre semanas, avisos de salida, selección entre búsquedas y reintento de solo las filas pendientes.
- `npm run check` completo en verde: **372 pruebas en 39 archivos**, formato, ESLint, tipos y compilación de producción. Revisión React: cálculos derivados, actualizaciones desde eventos, controles con etiquetas, limpieza de listeners y acciones autenticadas. Se eliminan el formulario y las acciones individuales que quedaron sin uso. Sin cambios de esquema, dependencias, service role ni RLS.
- Verificación en la app real como coach: crear una plantilla de tres semanas; seleccionar Sentadilla y Press de banca en búsquedas distintas y agregarlos juntos; modificar dos prescripciones; rechazar un mínimo de 15 frente a un máximo de 12; cambiar a la segunda semana y volver conservando las ediciones; corregir y guardar ambas. Recargar conserva Sentadilla con 4 series y 62,5 kg y Press con 3 series de 9–12 repeticiones.
- Copiar la primera semana a la segunda y reordenar Sentadilla debajo de Press. Una lectura independiente mediante Supabase con sesión del coach confirmó posiciones, series, repeticiones y pesos de ambas semanas. La plantilla «Fuerza · prueba del editor» queda disponible sin asignarla a alumnos ni modificar sus programas.
- Inspección visual en escritorio (1280 × 900) y móvil (360 × 800). Sin desbordamiento horizontal: ancho del documento 345 px con viewport de 360 px (barra de scroll). Los controles visibles del editor medidos cumplen 44 px; el control de desarrollo de Next queda fuera de esa comprobación. Catálogo con filas de selección etiquetadas, jerarquía de encabezados y semanas ocultas fuera del árbol accesible. Capturas en `outputs/editor-coach.jpg` y `outputs/editor-coach-movil.jpg` de la carpeta padre.
- Se actualizó el flujo E2E principal para selección múltiple, validación, edición entre semanas y recarga. `npm run test:e2e -- --list` reconoce los mismos **33 escenarios en 7 archivos**. La suite completa de Playwright/axe no se ejecutó: las interacciones se realizaron mediante el canal integrado de UI. No se reseteó la base ni se ejecutaron las suites que borran usuarios.
- Las prescripciones pendientes se conservan en la página al cambiar de semana y ante errores; no se promete restaurarlas después de cerrar. Los avisos cubren enlaces de la app, salida por formulario y `beforeunload`; la navegación Atrás/Adelante del historial SPA no tiene un bloqueo específico. Un alta cuya respuesta se pierde pide recargar y revisar la sesión antes de repetir para evitar duplicados.
