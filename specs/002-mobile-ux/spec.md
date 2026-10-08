# Spec 002 — Experiencia móvil (mobile-first)

Estado: aprobada por el usuario el 2026-10-07 ("tiene que estar pensado para usarse en móvil, trata de copiar de una app buena de planificación"). Amplía `specs/001-mvp/spec.md`; no cambia sus reglas de negocio, cambia **cómo se usa**. Los RF-n de la 001 siguen vigentes; esta spec numera RF-50 en adelante y **adelanta al MVP** RF-27 (temporizador de descanso) y RF-45 (PWA instalable).

## 1. Problema

La app funciona en el móvil, pero se siente como un formulario web: la sesión es un scroll largo de campos pequeños, el check de cada serie es un icono gris de 44 px, la barra inferior de navegación sigue visible mientras se entrena, no hay botón "Terminar" a mano ni descanso entre series, y "Mi semana" no muestra de un vistazo qué toca hoy. En el gimnasio se usa con una mano, con prisa y con los dedos sudados.

## 2. Referencia de diseño

Se copian patrones probados de **Hevy** y **Strong** (las apps de registro de pesas más usadas), no su marca ni sus pantallas:

| Patrón                               | Origen              | Qué se toma                                                              |
| ------------------------------------ | ------------------- | ------------------------------------------------------------------------ |
| Fila de serie con columna "Anterior" | Hevy, Strong        | `SERIE · ANTERIOR · KG · REPS · ✓`; tocar "anterior" copia los valores   |
| Check grande que se rellena          | Hevy                | Una sola acción grande por serie; la fila queda resaltada al completarla |
| Modo enfoque durante la sesión       | Hevy, Strong        | Sin navegación global; barra superior con cronómetro y botón "Terminar"  |
| Temporizador de descanso automático  | Hevy, Strong        | Arranca al marcar una serie, barra fija inferior, −15 s / +15 s / Saltar |
| Tira de la semana                    | TrainHeroic, Fitbod | Lunes a domingo con el estado de cada día                                |
| Tarjeta "Hoy toca"                   | Fitbod              | La próxima sesión con un botón grande                                    |

## 3. Requisitos (EARS)

### Navegación y estructura

- **RF-50**: EL SISTEMA se diseña primero para pantallas de 360 a 430 px de ancho, usable con una sola mano: acciones primarias en la mitad inferior, objetivos táctiles de al menos 44 px, campos numéricos con teclado numérico y sin zoom automático al enfocarlos (texto de al menos 16 px).
- **RF-51**: EL SISTEMA respeta las áreas seguras del dispositivo (muesca y barra de gestos) y declara su color de tema, de modo que la barra del navegador y el contenido no se solapan.
- **RF-52**: MIENTRAS el alumno entrena una sesión (`/workout/…`), EL SISTEMA oculta la cabecera global y la barra de navegación inferior y muestra un modo enfoque con barra superior fija (volver, nombre de la sesión, cronómetro, avance en series y botón "Terminar").

### Sesión de entrenamiento

- **RF-53**: EL SISTEMA muestra cada serie como una fila con las columnas serie, anterior, kg, reps y hecha. "Anterior" es el peso y las repeticiones de la misma serie de trabajo en la última sesión de ese ejercicio, o un guion si no hay.
- **RF-54**: CUANDO el alumno toca el valor "anterior" de una fila, EL SISTEMA copia ese peso y esas repeticiones a los campos de la fila.
- **RF-55**: CUANDO el alumno marca una serie como hecha y le falta un valor, EL SISTEMA lo completa con el valor de referencia (el peso precargado, las repeticiones de "anterior" o el mínimo prescrito) en lugar de bloquear el botón; SI aun así no hay un número válido, ENTONCES no la marca y lo indica.
- **RF-56**: EL SISTEMA marca visualmente la fila hecha (fondo y check rellenos), muestra el avance de cada ejercicio (series hechas de total) y, cuando un ejercicio queda completo, lo pliega mostrando un resumen que se puede volver a abrir.
- **RF-57**: EL SISTEMA agrupa las acciones secundarias de una serie (calentamiento, quitar) detrás de un toque en su número, y las de un ejercicio (agregar serie, saltar) en un menú de ejercicio, de modo que cada fila solo muestra lo que se usa en cada serie.
- **RF-58**: MIENTRAS hay una sesión en curso, EL SISTEMA intenta mantener la pantalla encendida (Wake Lock) y, si el dispositivo no lo soporta, no muestra error.
- **RF-59**: EL SISTEMA muestra el botón principal "Terminar" siempre accesible y mantiene la confirmación de RF-23 con el resumen de series; descartar sigue pidiendo confirmación (RF-26).

### Temporizador de descanso (adelanta RF-27)

- **RF-27 (revisado)**: CUANDO el alumno marca una serie como hecha, EL SISTEMA inicia un descanso de 90 s (60 s tras un calentamiento) y lo muestra en una barra fija inferior con la cuenta regresiva, botones −15 s y +15 s, y "Saltar". CUANDO llega a cero, EL SISTEMA vibra (si el dispositivo lo permite) y lo indica en pantalla. EL SISTEMA calcula el tiempo restante a partir de la hora de término, de modo que sigue siendo exacto tras bloquear la pantalla o cambiar de aplicación. El descanso dura entre 15 s y 10 min.
- **RF-60**: SI el alumno desmarca una serie, ENTONCES EL SISTEMA no inicia descanso.

### Mi semana

- **RF-61**: EL SISTEMA muestra en "Mi semana" una tira de lunes a domingo (zona America/Santiago) con el día de hoy resaltado y una marca en los días en que el alumno entrenó.
- **RF-62**: EL SISTEMA muestra una tarjeta destacada con la próxima sesión pendiente ("Hoy toca" o "Siguiente") con un botón "Empezar" grande y la lista de sus ejercicios; las demás sesiones aparecen debajo en una lista compacta. SI la semana está completa, ENTONCES muestra el mensaje de logro en lugar de la tarjeta.
- **RF-63**: EL SISTEMA reduce la racha en "Mi semana" a una línea compacta (llama, semanas y última semana) que lleva al detalle en Progreso.

### Instalación

- **RF-45 (revisado)**: EL SISTEMA se puede instalar en la pantalla de inicio como aplicación independiente: manifiesto con nombre, colores, `display: standalone`, `lang: es-CL`, orientación vertical e iconos de 192 y 512 px (también enmascarable) y un icono para iOS. Abre en `/week`.

## 4. Fuera de alcance

- Modo offline completo y service worker (la 001 ya lo excluye; la sesión en curso se protege con el borrador local).
- Notificaciones push (el aviso del descanso es en pantalla y vibración).
- Sonido del temporizador.
- Reordenar o sustituir ejercicios durante la sesión (RF-26 lo sigue prohibiendo).
- App nativa (sigue siendo posterior).

## 5. Decisiones

- DC-23: Los 90 s de descanso por defecto no son configurables por ejercicio en este corte; el alumno ajusta con ±15 s en el momento. Se reabre si el coach pide descansos prescritos.
- DC-24: El borrador local (RF-22) no guarda el descanso: si recarga la página, el temporizador se pierde y no afecta a los datos.
- DC-25: No se agrega ninguna dependencia nueva. Iconos de la PWA con `ImageResponse` de Next.
- DC-26: Se conservan las etiquetas accesibles de los campos y botones de la 001 (por ejemplo "Peso de la serie 1 de Sentadilla (kg)") para no romper los E2E ni a los lectores de pantalla.
- DC-27: El valor de reps vacío al marcar usa, en este orden: reps de "anterior" para esa serie, repeticiones mínimas prescritas.

## 6. Criterios de finalización

1. En un viewport de 375×812 la sesión completa (marcar series, descanso, terminar) se hace sin zoom ni scroll horizontal y con objetivos de 44 px.
2. Durante `/workout/…` no existe la barra de navegación global.
3. Marcar una serie inicia el descanso; el descanso sobrevive a un bloqueo de pantalla (cálculo por hora de término).
4. `Mi semana` muestra la tira, la tarjeta "Hoy toca" y la racha compacta.
5. El navegador ofrece instalar la app (manifiesto válido con iconos).
6. `npm run check`, los E2E (incluida accesibilidad AA en móvil, claro y oscuro) y el CI siguen en verde.
