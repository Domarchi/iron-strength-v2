# Spec 012 · Rediseño integral y calidad de producto (borrador para aprobación)

Fecha: 12-nov-2026. Estado: **propuesta, nada implementado**. Sustituye el orden de `docs/native-release-plan.md`: el rediseño va antes de los builds de tienda.

Base de la auditoría: código de `mobile/` (24.000 líneas, 63 componentes, 30 rutas), dependencias, specs 008–011 y cuatro capturas actuales a 360 px (Inicio, registro, progreso, resultado). No se revisó en teléfono físico ni todas las pantallas una a una; eso es la primera tarea del plan.

---

## 1. Diagnóstico

La app es sólida por dentro y modesta por fuera. La ingeniería (offline, cola, recuperación, RLS, 491 pruebas) está al nivel de un producto serio. La experiencia todavía se siente como una herramienta interna.

### 1.1 Lo que ya es un activo (no se toca)

- Registro que no pierde datos: borradores, cola, reintentos idempotentes, descanso absoluto.
- Modelo de entrenamiento completo: nueve tipos de ejercicio, superseries, alternativas, calentamientos, RPE, notas, discos.
- Offline real con descarga explícita.
- Accesibilidad base: 44 px, AA, texto al 200 %, movimiento reducido.

### 1.2 Problemas de diseño visual

| #   | Hallazgo                                                                                                                                 | Evidencia                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| V1  | Sin identidad propia: tipografía de sistema, azul genérico, ningún elemento de marca dentro de la app                                    | No hay `fontFamily` propio; paleta negro/grafito/azul                   |
| V2  | Jerarquía plana: casi todo es texto del mismo peso en lista                                                                              | Resultado: «560 kg de volumen», «420 s registrados» como líneas sueltas |
| V3  | Navegación con enlaces de texto centrados («Volver a mis ejercicios») en vez de cabeceras nativas                                        | `headerShown: false` en los tres layouts                                |
| V4  | Gráficos mínimos: línea sin ejes, sin valores, sin interacción                                                                           | Progreso de Sentadilla: tres puntos sin etiquetas                       |
| V5  | Pantallas con mucho vacío o mucho ruido: Inicio usa media pantalla; el registro mezcla acciones primarias y destructivas                 | «Descartar registro local» a un toque del flujo normal                  |
| V6  | Sin contenido visual de ejercicios: no hay imagen, animación ni mapa muscular                                                            | El catálogo es solo texto                                               |
| V7  | Sin estados de recompensa: terminar un entrenamiento o batir un récord se ve igual que cualquier pantalla                                | Resultado sin resumen destacado                                         |
| V8  | Iconografía escasa e inconsistente; etiquetas técnicas visibles («Guardado en este dispositivo», «Sin conexión · Descargar esta semana») | Capturas de Inicio y registro                                           |

### 1.3 Problemas de fluidez

| #   | Hallazgo                                                                    | Evidencia                                                                           |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| F1  | No hay motor de animación ni de gestos                                      | Faltan `react-native-reanimated` y `gesture-handler`; `Animated` solo en un archivo |
| F2  | Sin respuesta háptica ni sonido                                             | No hay `expo-haptics`                                                               |
| F3  | La pantalla puede apagarse durante el entrenamiento                         | No hay `expo-keep-awake`                                                            |
| F4  | El descanso no avisa si la app está en segundo plano                        | No hay `expo-notifications`                                                         |
| F5  | Paneles como pantallas o modales completos, no hojas inferiores con gesto   | Sin bottom sheet                                                                    |
| F6  | Listas largas con `ScrollView` (9 archivos) frente a 5 virtualizadas        | Riesgo de tirones en historial y catálogo                                           |
| F7  | Carga con indicador giratorio, sin esqueletos ni transiciones entre estados | `ActivityIndicator` en 10 archivos                                                  |
| F8  | Entrada de números con teclado del sistema y varios toques por serie        | Tabla kg/reps actual                                                                |

### 1.4 Funciones que faltan para una app de entrenamiento completa

- **Antes de entrenar:** bienvenida inicial, recordatorios, vista de calendario del programa, estado del día.
- **Durante:** instrucciones y demostración del ejercicio, teclado numérico propio con incrementos, sugerencia de progresión, cronómetros (EMOM, AMRAP, intervalos), aviso de descanso en segundo plano, pantalla siempre encendida.
- **Después:** resumen con récords, comparación con la sesión anterior, compartir imagen, racha.
- **Seguimiento:** medidas y fotos (hoy solo web), logros (hoy solo web), mapa muscular semanal, peso corporal.
- **Coach–alumno:** notificaciones de comentarios, chat simple, check-in semanal (sueño, energía, dolor), envío de video de técnica.
- **Coach en el teléfono:** hoy el coach planifica solo en web; no tiene panel móvil de alumnos.
- **Plataforma:** HealthKit / Health Connect, widget, actividad en vivo del descanso, modo tablet.
- **Operación:** monitoreo de errores y rendimiento, actualizaciones OTA.

---

## 2. Principios del rediseño

1. **El registro manda.** Cada decisión se mide en toques y segundos por serie.
2. **Una acción principal por pantalla.** Lo destructivo y lo raro va a un menú.
3. **Mostrar, no listar.** Números grandes, gráficos legibles, estado con color y forma.
4. **Se siente nativo.** Cabeceras, gestos, hojas, hápticos y transiciones de cada plataforma.
5. **Calma técnica.** El usuario no ve colas, borradores ni «dispositivo» salvo cuando hay un problema.
6. **Recompensa honesta.** Celebrar récords y constancia reales, sin inventar métricas.
7. **Nada se rompe.** Contratos, almacenamiento y recuperación actuales se conservan.

---

## 3. Sistema de diseño «Iron» v2

- **Marca:** fuente propia para títulos y cifras (candidata: Inter Tight o Geist; cifras tabulares), sistema para texto. Decisión D1.
- **Color:** negro cálido / grafito en oscuro, blanco hueso en claro; un acento de marca (decisión D2: mantener azul o pasar a un color propio) y tres semánticos (hecho, récord, alerta). Tokens con contraste AA verificado.
- **Forma:** radios 12/16/24, elevación por capas de superficie, no por sombras.
- **Escala tipográfica:** 6 niveles fijos; cifras de entrenamiento en 28–40 pt.
- **Iconos:** un solo set (Lucide o SF/Material por plataforma), 24 px, trazo 1,75.
- **Movimiento:** 3 duraciones (120/220/360 ms), una curva; todo respeta Reducir movimiento.
- **Háptica:** ligera al marcar serie, media al terminar descanso, éxito al cerrar.
- **Componentes base (≈25):** AppBar, TabBar, Sheet, Card, ListRow, Stat, Chip, SegmentedControl, NumberPad, Stepper, SetRow, RestBar, Chart, ProgressRing, Avatar, Badge, Toast, Banner, EmptyState, Skeleton, Dialog, Menu, Button, Input, Switch.
- **Entrega:** biblioteca en `mobile/src/ui/` con galería interna navegable y pruebas visuales por componente en claro/oscuro/200 %.

---

## 4. Rediseño por áreas

### 4.1 Entrada y bienvenida

- Bienvenida de 3 pasos la primera vez: unidades, recordatorios, tema.
- Acceso con correo; desbloqueo biométrico opcional al reabrir (Face ID / huella).

### 4.2 Inicio («Hoy»)

- Tarjeta del día: sesión de hoy con duración estimada, músculos y botón **Empezar**; si hay registro abierto, **Retomar** con tiempo transcurrido.
- Tira semanal con días hechos / pendientes / descanso.
- Racha y resumen de la semana (sesiones, volumen, récords).
- Comentario nuevo del coach como tarjeta.
- Estado de conexión y descarga solo como icono discreto; el detalle va en Cuenta.

### 4.3 Entrenar (biblioteca)

- Pestañas: Mi programa · Mis rutinas · Ejercicios.
- Tarjetas de rutina con músculos, duración y última vez.
- Ficha de ejercicio con demostración, instrucciones, músculos, historial y récords.

### 4.4 Registro en curso (la pantalla más importante)

- Cabecera compacta: nombre, cronómetro, progreso en anillo; menú «···» con pausar, organizar, descartar.
- Un ejercicio a la vista, deslizar para cambiar; índice como tira superior.
- Fila de serie: objetivo, anterior (toque = copiar), kg, reps, check grande. Deslizar la fila para borrar o marcar tipo.
- **Teclado propio** con ±2,5 / ±5, «igual que la anterior» y siguiente campo automático.
- Descanso automático al marcar, barra inferior con anillo, ±15 s, aviso con vibración y notificación si la app está detrás.
- Sugerencia de carga cuando se cumplió el tope de repeticiones la vez anterior.
- Herramientas (discos, calentamiento, notas, alternativa, historial) en hoja inferior.
- Pantalla siempre encendida; modo de una mano.

### 4.5 Cierre y resultado

- Resumen con duración, volumen, series y **récords destacados**; comparación con la sesión anterior.
- Esfuerzo y nota en un paso corto.
- Imagen para compartir (opcional, sin datos privados).
- Estado «enviando / guardado» sin jerga.

### 4.6 Historial

- Calendario mensual con puntos por tipo de sesión y lista virtualizada.
- Detalle del entrenamiento con ejercicios plegables y comentarios del coach en línea.

### 4.7 Progreso

- Panel: constancia, volumen semanal, mapa muscular, récords recientes.
- Gráficos con ejes, valores, toque para ver el punto y selector 4/8/12 semanas/todo.
- Por ejercicio: 1RM estimado, mejor serie, volumen, tabla de récords.
- Cuerpo: peso, medidas y fotos con comparación (traído de la web).
- Logros (traído de la web).

### 4.8 Coach y comunicación

- Bandeja de comentarios con notificaciones.
- Check-in semanal de 4 preguntas que el coach ve en su panel.
- Envío de video de técnica al coach (requiere almacenamiento privado; decisión D5).

### 4.9 Coach en el teléfono (nuevo)

- Lista de alumnos con señales (inactivo, comentario pendiente, récord).
- Ficha del alumno: semana, último entrenamiento, progreso, responder.
- Editar programas sigue en web en esta versión.

### 4.10 Cuenta y ajustes

- Perfil, unidades, descanso habitual, equipo, tema, notificaciones, descargas, privacidad, ayuda, borrar cuenta. Agrupado como ajustes nativos.

### 4.11 Web del coach

- Aplicar el mismo sistema de diseño (tokens compartidos) al editor y al panel tras cerrar PR19.

---

## 5. Calidad que recibe el usuario (criterios medibles)

| Área                | Meta                                                                      |
| ------------------- | ------------------------------------------------------------------------- |
| Arranque en frío    | < 2 s hasta Inicio útil en un teléfono de gama media                      |
| Registrar una serie | ≤ 2 toques si repite la anterior; ≤ 5 si cambia kg y reps                 |
| Fluidez             | 60 fps en desplazamiento y transiciones; sin saltos de layout             |
| Respuesta al toque  | Reacción visual < 100 ms en toda acción                                   |
| Fiabilidad          | 0 pérdidas de series en pruebas de corte de red, cierre forzado y batería |
| Fallos              | > 99,5 % de sesiones sin cierre inesperado (medido con monitoreo)         |
| Accesibilidad       | AA, lector de pantalla en los 5 recorridos clave, texto 200 %, 44 px      |
| Coherencia          | 100 % de pantallas con componentes del sistema; 0 estilos sueltos         |
| Offline             | Entrenar completo sin red y sincronizar sin intervención                  |
| Textos              | Español de Chile, tuteo, sin jerga técnica; revisados pantalla a pantalla |

Cada meta se verifica con una prueba o medición concreta antes de cerrar su fase. Las de rendimiento y háptica requieren teléfonos físicos.

---

## 6. Plan por fases

Numeración continúa desde T235. Cada tarea: spec → pruebas → implementación → controles → commit.

### Fase A · Fundamentos (≈ 1,5 semanas)

- **T236** Auditoría completa pantalla a pantalla (30 rutas × claro/oscuro) con capturas y lista priorizada de defectos; medición base de toques y tiempos.
- **T237** Dirección visual: 2 propuestas de marca (tipografía, color, forma) sobre 4 pantallas clave en prototipo navegable. **Requiere tu aprobación.**
- **T238** Dependencias nativas: reanimated, gesture-handler, haptics, keep-awake, bottom-sheet, lista virtualizada, fuente. **Requiere aprobación** (regla del proyecto) y nuevo build de desarrollo; Expo Go puede dejar de bastar.
- **T239** Sistema de diseño v2: tokens, 25 componentes, galería y pruebas visuales.

### Fase B · Núcleo de entrenamiento (≈ 3 semanas)

- **T240** Navegación nativa: cabeceras, gestos de retroceso, hojas, transiciones.
- **T241** Registro en curso rediseñado (4.4) sobre los controladores actuales.
- **T242** Teclado numérico propio y copia rápida.
- **T243** Descanso: anillo, háptica, notificación local, pantalla encendida.
- **T244** Cierre y resultado con récords y comparación.
- **T245** Inicio «Hoy» y tira semanal.

### Fase C · Biblioteca, historial y progreso (≈ 2,5 semanas)

- **T246** Biblioteca y editor de rutinas con el nuevo sistema.
- **T247** Ficha de ejercicio con instrucciones y demostración (fuente de contenido: decisión D4).
- **T248** Historial con calendario y lista virtualizada.
- **T249** Progreso: gráficos interactivos, panel y mapa muscular.
- **T250** Cuenta y ajustes.

### Fase D · Funciones nuevas (≈ 3–4 semanas)

- **T251** Bienvenida y recordatorios de entrenamiento.
- **T252** Notificaciones push de comentarios del coach (requiere servicio de envío y migración).
- **T253** Medidas, peso y fotos en nativo.
- **T254** Logros y racha en nativo.
- **T255** Sugerencia de progresión y cronómetros EMOM/AMRAP.
- **T256** Check-in semanal alumno → coach (migración + RLS + web del coach).
- **T257** Coach en el teléfono: alumnos, ficha y respuestas (solo lectura + comentarios).
- **T258** Desbloqueo biométrico.

### Fase E · Pulido y calidad (≈ 2 semanas)

- **T259** Rendimiento: perfilado, virtualización, arranque, tamaño.
- **T260** Accesibilidad con VoiceOver y TalkBack en teléfonos reales.
- **T261** Textos: revisión completa de la voz de la app.
- **T262** Monitoreo de errores y rendimiento (decisión D6 por privacidad).
- **T263** Web del coach con el sistema v2.
- **T264** Regresión total, prueba en 4 teléfonos y entrega de builds internos.

### Después (fuera de este plan salvo que lo pidas)

HealthKit / Health Connect, widget y actividad en vivo, reloj, video de técnica, compartir imagen, tablet, OTA. Luego sigue el plan de tiendas.

**Duración total estimada: 12–13 semanas** de trabajo continuo. Entrega mínima con impacto (Fases A + B): ≈ 4,5 semanas.

---

## 7. Decisiones que necesito de ti

| #   | Decisión                                                                       | Mi recomendación                                           |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| D1  | Tipografía de marca                                                            | Proponer 2 en T237 y eliges sobre pantallas reales         |
| D2  | Color de acento: mantener azul o nuevo                                         | Evaluar en T237; el azul actual es poco distintivo         |
| D3  | Aceptar dependencias nativas nuevas (T238)                                     | Sí: sin ellas no hay fluidez ni háptica real               |
| D4  | Contenido de ejercicios: banco libre, generado o grabado por el coach          | Empezar con texto + mapa muscular; media del coach después |
| D5  | Video de técnica y fotos: usa almacenamiento de Supabase (plan gratuito, 1 GB) | Fotos sí; video aplazado                                   |
| D6  | Monitoreo de errores (Sentry u otro)                                           | Sí, sin datos personales, declarado en privacidad          |
| D7  | Notificaciones push: requiere credenciales Apple/Google                        | Hacer primero las locales (descanso, recordatorios)        |
| D8  | Alcance: todo (12–13 semanas) o entrega mínima A+B primero                     | A+B primero, revisas en tu teléfono, y seguimos            |
| D9  | Coach en el teléfono en esta versión                                           | Sí, en modo lectura + comentarios                          |

## 8. Riesgos

- **Dependencias nativas** obligan a builds de desarrollo; las pruebas actuales en Expo web seguirán valiendo para lógica, no para gestos ni háptica.
- **Regresión:** 580 pruebas de interfaz dependen de textos y roles actuales; cada pantalla rediseñada actualiza sus oráculos sin retirar aserciones de datos.
- **Formatos locales:** ningún sobre, cola o borrador cambia de versión por motivos visuales.
- **Funciones con servidor** (T252, T253, T256, T257) necesitan migraciones: respaldo, restauración y ensayo antes de aplicar, como hasta ahora.
- **Evidencia física:** fluidez, háptica y notificaciones solo se acreditan en teléfonos reales.
