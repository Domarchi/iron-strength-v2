# Spec 006 — Azul atleta

Referencia aprobada por Joaquin el 21 de octubre de 2026: [reference-a.png](reference-a.png), conservada en esta especificación. La referencia muestra inicio y registro móvil, y planificación del coach en escritorio. Amplía las specs anteriores sin cambiar sus reglas de entrenamiento, seguridad o recuperación.

## Fidelidad y adaptación

Reproducir la composición, jerarquía, proporciones, profundidad e identidad azul de la propuesta A mediante componentes reales. La imagen es una referencia visual, no una pantalla para incrustar. Textos, fechas, nombres, estados y cantidades proceden de los datos reales; no introducir alumnos, avisos, ejercicios ni disponibilidad offline ficticios. Conservar todos los accesos actuales, incluido Cuerpo. Las diferencias necesarias para campos adicionales, accesibilidad y tamaños de pantalla se documentan.

- Inicio: cabecera azul marino, calendario compacto con día actual circular y marcas de entrenamiento, superficie clara superpuesta; próxima sesión destacada con imagen original, título, conteo y acción azul. Otras sesiones en filas compactas con estado y acceso a detalle/inicio. Día orientativo, resumen, descarga y recuperación siguen disponibles.
- Registro: superficie azul marino en ambos temas para el modo de entrenamiento, con variables locales de contraste; título, tiempo destacado, series y volumen; cabecera de ejercicio con ilustración original, prescripción y última ejecución. Filas compactas de serie/anterior/kg/reps/completado; verde turquesa para las series hechas. Descanso en panel inferior redondeado con ajustes de 15 segundos, tiempo grande y acción de omitir. Preservar formularios, historial, alternativas, calentamientos, sugerencias, deshacer, cierre y recuperación, también offline.
- Coach web: barra lateral azul marino desde 1024 px, identidad y acceso a cuenta/salida; espacio de trabajo amplio, semanas en cinta horizontal, sesiones con navegación y filas de ejercicio alineadas, miniaturas y biblioteca lateral. En móvil apilar sin desbordamiento. Mantener los editores montados al cambiar semana/sesión para no perder borradores. Renderizar el catálogo solamente en la semana visible y al desplegarlo en móvil; su selección permanece en el editor. Mantener acciones de orden por teclado además del arrastre, selección múltiple, grupos, notas y alternativas.
- Componentes compartidos: superficies blanco azulado, tipografía nítida, bordes suaves, sombras discretas, azul cobalto. Tema oscuro conservado fuera de los paneles deliberadamente marinos. Respetar movimiento reducido, AA, campos móviles de 16 px y objetivos táctiles de 44 px.
- Recursos originales públicos sin información privada; disponibles en la lista cerrada del worker para que el registro descargado siga completo. Ningún caché de HTML autenticado, credenciales o fotos privadas. Catálogo sin ilustración específica usa el icono propio existente; una ilustración de sentadilla no representa otros movimientos.

Los textos azules usan `#005fd9` para mantener contraste AA en superficies suaves; las acciones destacadas conservan `#0068ec`.

## Criterios de aceptación

1. Comparar capturas del inicio y registro a 390 × 844 y editor a 1440 × 1000 con A, y revisar ajuste a 360 px y ambos temas. Verificar ausencia de imágenes rotas y desbordamiento.
2. Completar y desmarcar una serie, consultar historial y recuperar tras recarga, conservando valores y tiempo absoluto del descanso. Mantener pruebas existentes de sustitución, grupos, sincronización y aislamiento de cuentas.
3. Buscar/agregar desde biblioteca, editar y guardar, arrastrar y cambiar semanas/sesiones sin perder borradores ni omitir conflictos. Campos editables y nombres accesibles existentes se conservan.
4. Verificar recursos visuales disponibles con sesión cerrada y en descarga offline, sin ampliar acceso a rutas privadas.
5. `npm run check` y suite E2E Chromium/WebKit en verde. No hay cambios de esquema ni pruebas destructivas sobre datos interactivos o producción.
