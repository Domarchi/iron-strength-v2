# Tareas · Spec 012 · Rediseño integral y calidad (alcance completo)

Alcance aprobado por el propietario el 12-nov-2026: plan completo (fases A–E). Plan y diagnóstico en `plan.md`. Ninguna tarea está implementada. Cada una: spec → pruebas → implementación → controles → commit `Tn: título`. Las tareas con servidor exigen respaldo, restauración y ensayo antes de migrar.

## Decisiones abiertas (bloquean tareas indicadas)

- D1/D2 marca y color → **resueltas**: A · Forja (T237).
- D3 dependencias nativas nuevas → bloquea T238 y todo lo posterior de la fase B.
- D4 contenido de ejercicios, D5 fotos/video, D6 monitoreo, D7 push, D9 coach en teléfono → ver `plan.md` §7.

## Fase A · Fundamentos

- [x] T236 · Auditoría pantalla a pantalla: 84 capturas (claro/oscuro, 360 px; 12 pantallas también a 412) y 31 defectos priorizados en `audit-t236.md`. Quedan sin cubrir ficha de ejercicio, organizar/agregar/reemplazar en registro, errores y sin conexión (se completan en T241/T246); medición en teléfono real en T238.
- [x] T237 · Dirección de marca elegida por el propietario el 12-nov-2026: **A · Forja** (Barlow Condensed + Inter, acento naranja #FF5A1F oscuro / #E8480F claro, récord ámbar, radios 8–12 px). D1 y D2 resueltas. Referencia en `docs/design-refresh/brand/` y `brand-t237.md`.
- [x] T238 · Dependencias nativas instaladas en la rama `codex/redesign-forja-20261112` con versiones SDK 58 (`expo install`): reanimated 4.7.1, worklets 0.13.0, gesture-handler 3.3.0, expo-haptics, expo-keep-awake, @gorhom/bottom-sheet 5.2, @shopify/flash-list 2.3.2, fuentes Barlow Condensed e Inter (@expo-google-fonts), y safe-area-context/screens al parche esperado. `GestureHandlerRootView` envuelve la app. Verificado: check móvil (491 pruebas), exportación Hermes Android/iOS con todos los módulos importados, 60 E2E de web en Chromium/WebKit. Pendiente: comprobar en Expo Go del teléfono si basta o se necesita build de desarrollo; medición de toques/tiempos reales.
- [x] T239 · Sistema de diseño v2 «Forja» en `mobile/src/ui/`: tokens (claro/oscuro, contraste AA verificado), tipografía de siete niveles, fuentes cargadas sin bloquear, 22 componentes (Button con cuatro roles, IconButton, Badge, Chip, Avatar, Card, ListRow, Stat, SectionHeader, Divider, EmptyState, Skeleton, ProgressRing, SegmentedControl, Toggle, Stepper, TextField, Banner, Toast, Sheet, Dialog, Menu, AppBar) y galería `/design` solo en desarrollo. Aún no reemplaza las pantallas actuales (T240–T250). Corrección al diseño aprobado: el naranja claro #E8480F no cumple AA con texto blanco (3,9:1); se usa #C73A08. SetRow, RestBar, NumberPad y Chart quedan para T241–T249.

## Fase B · Núcleo de entrenamiento

- [x] T240 · Paleta Forja aplicada a toda la app remapeando la paleta existente (claves conservadas; contraste AA verificado), fuentes en el sistema de estilos base, acciones de peligro (`danger`) en las destructivas y enlaces «Volver…» como flecha + texto a la izquierda. Regresión móvil completa: 588 aprobadas, 32 omitidas, 6 fallos corregidos (título del registro en una línea, botones que envuelven al ampliar texto).
- [x] T241 · Registro: el peso precargado desde la prescripción se muestra atenuado hasta marcar la serie (`isSuggestedWeight`, con pruebas), anillo de avance en la cabecera, título del registro en una línea y acciones de peligro diferenciadas. Se conserva la estructura y los nombres accesibles. 54 E2E de registro/herramientas/pausa/fluidez aprobadas (ambos motores). Queda para T245/T250 la reorganización de la cabecera con menú «···».
- [ ] T242 · Teclado numérico propio y copia rápida.
- [ ] T243 · Descanso: anillo, háptica, notificación local, pantalla encendida.
- [ ] T244 · Cierre y resultado con récords y comparación.
- [ ] T245 · Inicio «Hoy» y tira semanal.

## Fase C · Biblioteca, historial y progreso

- [ ] T246 · Biblioteca y editor de rutinas.
- [ ] T247 · Ficha de ejercicio con instrucciones y demostración (D4).
- [ ] T248 · Historial con calendario y lista virtualizada.
- [ ] T249 · Progreso: gráficos interactivos, panel y mapa muscular.
- [ ] T250 · Cuenta y ajustes.

## Fase D · Funciones nuevas

- [ ] T251 · Bienvenida y recordatorios.
- [ ] T252 · Notificaciones push de comentarios (D7; migración).
- [ ] T253 · Medidas, peso y fotos en nativo (D5).
- [ ] T254 · Logros y racha en nativo.
- [ ] T255 · Sugerencia de progresión y cronómetros EMOM/AMRAP.
- [ ] T256 · Check-in semanal alumno → coach (migración, RLS, web del coach).
- [ ] T257 · Coach en el teléfono: alumnos, ficha, comentarios (D9).
- [ ] T258 · Desbloqueo biométrico.

## Fase E · Pulido y calidad

- [ ] T259 · Rendimiento: perfilado, virtualización, arranque, tamaño.
- [ ] T260 · Accesibilidad con VoiceOver/TalkBack en teléfonos reales.
- [ ] T261 · Revisión completa de textos (es-CL, tuteo, sin jerga).
- [ ] T262 · Monitoreo de errores y rendimiento (D6).
- [ ] T263 · Web del coach con el sistema v2 (tras cerrar PR19).
- [ ] T264 · Regresión total, prueba en cuatro teléfonos, builds internos.

## Reglas heredadas

Contratos, sobres, cola y borradores locales no cambian de versión por motivos visuales. Demo y puertos protegidos (3104/3105/8087/8091/8096/8097, base 55321) no se tocan; la auditoría usa servidor y puerto propios. Las pruebas web/Hermes no acreditan fluidez, háptica ni notificaciones: eso exige teléfono físico. Tiendas se retoman después (`docs/native-release-plan.md`).
