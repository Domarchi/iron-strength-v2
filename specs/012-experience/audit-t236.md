# T236 · Auditoría visual y de flujo · 12-nov-2026

## Alcance real

- **Capturado y revisado (claro y oscuro, 360 px; las 12 primeras también a 412 px):** acceso, invitación, recuperación, privacidad, Inicio (sin y con datos), Entrenar, Historial (lista y calendario), Progreso (lista, detalle por ejercicio, resumen), rutina, registro (4 estados), cierre, resultado, opciones del resultado, repetir, guardar como rutina, corregir, catálogo (solo oscuro), mis rutinas, editor de rutina, selector de ejercicios, mis ejercicios y formulario de ejercicio nuevo. 84 imágenes en `docs/design-refresh/audit/`. Revisión visual hecha sobre el tema oscuro a 360 px; el claro lo revisé solo en la primera tanda.
- **No capturado (límite del colector o de los fixtures):** catálogo en claro y **ficha de ejercicio** (el botón no apareció en el fixture), pantalla de eliminar con datos reales (la fixture devolvió «Fixture no configurada»), repetir/guardar como rutina con datos (la fixture dejó el ejercicio fuera de catálogo y solo muestra el aviso), organizar/agregar/reemplazar durante el registro, estados de error y sin conexión, y todo lo del coach en web.
- **Método:** Expo web (Chromium, viewport móvil), API simulada y fixtures existentes, servidor propio en el puerto 8100. Colectores: `mobile/e2e/audit-capture.spec.ts` y `audit-capture-2.spec.ts` (solo corren con `AUDIT_CAPTURE=1`). Es emulación: no mide fluidez, háptica ni teclado reales.
- Ignorar en las capturas: el botón de rayo (menú de desarrollo de Expo) y los textos «Fixture no configurada» / «Solo entrada en calor» (datos de fixture).

## Medición base

- Inicio → primera serie registrada: **4 toques** (Empezar, kg, reps, check) con el peso ya precargado; con kg distinto sube la escritura. Meta del plan: ≤ 2 si repite la anterior.
- Teclado: se usa el del sistema para kg y reps; no hay copia rápida de la serie anterior visible cuando la columna «Anterior» está vacía.
- Los tiempos de arranque de esta corrida (~1 s) vienen de API simulada y no son una línea base válida; falta medirlos en teléfono.

## Defectos priorizados

### Alta (afectan el uso o la percepción de calidad)

| ID  | Pantalla               | Hallazgo                                                                                                                                                                                                                                    |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Registro               | Acciones de distinto peso con el mismo estilo de enlace azul: «Agregar serie», «Herramientas», «Detalles» y **«Descartar registro local»** (destructiva) quedan juntas y a un toque. Debe ir en el menú y con confirmación visual distinta. |
| H2  | Registro               | El peso precargado (55, 50, 40) se ve igual que uno digitado; no se distingue sugerencia de dato real. Riesgo de marcar una serie sin revisar.                                                                                              |
| H3  | Registro               | Cabecera fija ocupa casi 190 px (atrás, título, cronómetro, pausa, Finalizar, estado guardado y fila de ejercicios), antes de la primera serie. «Guardado en este dispositivo» es jerga permanente.                                         |
| H4  | Registro               | En superserie no hay feedback de ronda al marcar (la serie 1 de Sentadilla pasa a Remo sin celebración ni indicación clara); el descanso solo aparece al cerrar la ronda.                                                                   |
| H5  | Herramientas           | Hoja con **título duplicado y dos botones de cerrar** («Herramientas del ejercicio» + «Herramientas · Remo»).                                                                                                                               |
| H6  | Cierre                 | «Esfuerzo 1–10» es un campo de texto libre en vez de selector; muestra «0 s registrados · 0 m» en una sesión de fuerza (ruido).                                                                                                             |
| H7  | Inicio/Entrenar/Cuenta | La misma tarjeta «Entrenar sin conexión / Descargar» aparece **tres veces** (Inicio, Entrenar, Cuenta), y en Entrenar ocupa el primer bloque encima de las acciones principales.                                                            |
| H8  | Entrenar               | «Rutinas de ejemplo (demos locales)» se muestra a usuarios reales mezcladas con su contenido. Debe ocultarse o moverse a una sección opcional.                                                                                              |
| H9  | Historial/Progreso     | Estados vacíos solo con párrafo de texto, sin acción ni guía («Puedes probar una demo desde Entrenar»). Es la primera impresión de un alumno nuevo.                                                                                         |

### Media

| ID  | Pantalla                          | Hallazgo                                                                                                                                                          |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Inicio                            | El icono de actualizar queda recortado sobre la barra inferior.                                                                                                   |
| M2  | Navegación                        | Sin cabecera nativa: en rutina solo hay una flecha suelta; en resultado y progreso, enlaces de texto centrados («Volver a…»).                                     |
| M3  | Cuenta                            | «Preferencias de entrenamiento», «Mis ejercicios» y «Privacidad y ayuda» son enlaces centrados sin forma de lista de ajustes; falta tarjeta de perfil con avatar. |
| M4  | Historial                         | Filtro «Origen» sin icono ni etiqueta clara; buscador ocupa el primer lugar aun sin resultados.                                                                   |
| M5  | Progreso                          | Pestañas «Ejercicios / Resumen» más buscador y refresco en la misma franja: jerarquía confusa; vacío sin gráfico de ejemplo.                                      |
| M6  | Rutina                            | Sin duración estimada, músculos ni última vez; bloque de superserie con barra lateral azul y enlace «Ver alternativas…» de peso débil.                            |
| M7  | Global                            | Sin identidad de marca dentro de la app: tipografía del sistema, mismo azul genérico, solo el pequeño logotipo en Inicio.                                         |
| M8  | Resultado (captura anterior T230) | Resumen en líneas de texto sueltas, sin destacar récords; nombres de prueba («Movimiento 0») son de fixture.                                                      |
| M9  | Progreso por ejercicio (T230)     | Gráfico sin ejes, valores ni toque para ver un punto.                                                                                                             |

### Baja

- Todas las pantallas usan títulos grandes pero sin cifras destacadas; solo el contador «0 / 1» de la semana.
- La columna «Anterior» muestra «—» y ocupa ancho aun sin historial.
- Check circular sin etiqueta visible de estado (hecho/pendiente) más allá del color/relleno.

### Segunda tanda (rutas restantes)

**Alta**

| ID  | Pantalla                      | Hallazgo                                                                                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H10 | Navegación global             | **Cuatro patrones distintos** para volver/navegar: título grande de pestaña; cabecera con flecha y título (Biblioteca, Mis rutinas, Agregar ejercicios); enlace de texto centrado («Volver a mis ejercicios», «Volver al historial», «Volver al resultado»); barra «Volver / Guardar» del editor. Es la mayor causa de sensación de app armada por partes. |
| H11 | Opciones del resultado        | «Eliminar entrenamiento» usa el mismo azul de enlace que cualquier opción y queda entre Corregir y Repetir; la acción destructiva no tiene color ni separación de peligro.                                                                                                                                                                                 |
| H12 | Corregir                      | Formulario muy largo: cada serie lleva dos campos y dos botones de ancho completo («Cambiar a calentamiento», «Retirar serie»); «Esfuerzo» otra vez como campo de texto libre.                                                                                                                                                                             |
| H13 | Repetir / Guardar como rutina | Si falta un ejercicio en el catálogo la pantalla queda sin salida: solo un aviso y un enlace «Volver» (no ofrece sustituir ni continuar sin él).                                                                                                                                                                                                           |

**Media**

| ID  | Pantalla                    | Hallazgo                                                                                                                                                                                                                                   |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M10 | Progreso                    | Pluralización incorrecta: «1 entrenamientos», «1 series».                                                                                                                                                                                  |
| M11 | Progreso por ejercicio      | Con pocos datos el gráfico es una línea vacía con un punto; las pestañas de periodo y de métrica ocupan dos filas cada una y empujan el contenido; «Marcas históricas» y «Detalle del cálculo» son enlaces centrados sueltos.              |
| M12 | Progreso → Resumen          | La línea «1.000 registrados» se ve sin la unidad (verificar si es recorte o texto); barras de distribución muscular muy finas.                                                                                                             |
| M13 | Mis ejercicios / formulario | Los selectores («Tipo de registro», «Cambiar músculo», «Ajustes del ejercicio») se ven como enlaces de texto centrados bajo un valor, no como campos; «Actualizar ejercicios» y «Exportar mis ejercicios» como enlaces sin forma de lista. |
| M14 | Acceso e invitación         | Las acciones secundarias («Ingresar otro enlace», «Privacidad y ayuda») son enlaces centrados; el campo de contraseña no indica requisitos; sin indicador de qué sigue tras comprobar la invitación.                                       |
| M15 | Privacidad                  | Muro de texto de un solo nivel; los enlaces externos quedan apilados y centrados, sin agrupar contacto, política y eliminación.                                                                                                            |
| M16 | Mis rutinas / catálogo      | Estados vacíos solo con una frase; el catálogo es lista de texto sin imagen, músculo visual ni favoritos.                                                                                                                                  |
| M17 | Editor de rutina            | Círculo de selección sin explicación de su función (agrupar), «Reordenar ejercicios» deshabilitado como enlace, fila Series/Mín./Máx./kg densa; el botón fijo «Agregar 0 ejercicios» tiene un texto torpe cuando está vacío.               |
| M18 | Historial                   | «Nota conservada» se repite en casi todas las filas; filas con «1 ejercicio · 0 series» sin explicación; calendario con un solo punto azul sin distinguir tipo de sesión.                                                                  |

**Baja**

- Login: campo contraseña sin ayuda ni «¿Olvidaste tu contraseña?» visible; el botón «Entrar» deshabilitado se ve casi igual que habilitado.
- Resultado: la conversación ocupa mucho espacio antes del cierre de pantalla; «Ver mi historial» y «Opciones» comparten fila con jerarquía débil.

### Patrón transversal (resume H1, H10, M2, M3, M13, M14, M15)

Casi todas las acciones secundarias son **texto azul centrado sin forma**. El usuario no distingue enlace, botón, selector ni acción destructiva. El sistema de diseño v2 debe definir cuatro roles claros (primario, secundario, terciario/enlace, peligro) y reemplazar estos enlaces.

## Lo que ya funciona (no tocar)

Barra de pestañas legible con iconos, títulos de sección claros, contraste correcto en ambos temas, tarjeta «Siguiente sesión» con un CTA evidente, tabla kg/reps alineada, hojas modales con cierre, texto escalable (probado en T231).

## Siguiente

1. Capturar lo no cubierto (ficha de ejercicio, organizar/agregar/reemplazar en registro, errores y sin conexión) con fixtures ajustados; es trabajo menor y puede hacerse dentro de T241/T246 donde se rediseñan esas pantallas.
2. Medir toques y tiempos reales en teléfono con el build de desarrollo (T238).
3. Convertir H1–H9 y M1–M9 en criterios de aceptación de T240–T250.
