# Calidad de producto de Iron Strength

El propietario aprobó el 24 de octubre de 2026 avanzar desde T188 hacia un producto completo. Este ciclo concreta las etapas 1–4 del plan: alcance, recorridos, sistema visual y cuatro pantallas de referencia, junto con preparación local de distribución. El diseño de referencia se revisa antes de extenderlo a las pantallas funcionales. El resto de la hoja de ruta queda planificado; documentarlo no lo convierte en funciones disponibles.

## Usuarios y alcance

Un coach y tres alumnos. El coach también entrena con su propia cuenta. Alumno móvil Android/iPhone; planificación y seguimiento del coach en web de escritorio. Mantener Next.js, Expo SDK 58 y Supabase exclusivos existentes; reutilizar reglas, permisos y datos. No reconstruir funciones aprobadas de specs 005–008. Nutrición, pagos, redes sociales, IA, importación de planillas y cambios automáticos de cargas quedan fuera de v1.

## Resultado de esta entrega

- Inventario por plataforma con evidencia de rutas y contratos existentes, sin equiparar web con móvil.
- Recorridos, estados, límites y criterios medibles de la primera versión para tiendas.
- Fundamentos visuales negro/grafito y gris/blanco; azul en acciones, tipografía del sistema, símbolos originales. Sin fotografía generada, fuentes remotas ni métricas falsas presentadas como reales.
- Prototipo HTML autónomo de Inicio, Entrenamiento, Progreso y editor del coach, con claro/oscuro y navegación. Datos ficticios marcados DEMO. Acciones locales para explorar el recorrido; ninguna petición a API, autenticación, persistencia de cuenta o escritura de producción. Presentar esta diferencia en la interfaz y capturas.
- Preparación local de perfiles de distribución Expo y requisitos de firma. Conservar owner/EAS ID, origen de API y Expo Go. No generar certificados, registrar identificadores, consumir builds remotos ni contratar servicios en esta entrega.

## Diseño y estados

Una acción principal por pantalla. Inicio prioriza Retomar sobre nueva sesión; entrenamiento centrado en el ejercicio actual, kilos/repeticiones directos y opciones secundarias plegadas. Progreso permite entender el periodo, métrica y evidencia; las gráficas futuras se calculan con registros reales. Editor permite adaptar una base, ver sesión/semana activas, objetivos por serie y guardado explícito con revisión. El prototipo debe explicar qué interacción es simulada.

Referencia base: tokens de mobile/src/lib/appearance.ts. Escala de espacios 4/8/12/16/24/32, texto principal 16 px, secundario 13–14 px, métricas tabulares y títulos 28–34 px; el tamaño se adapta a contenido y texto ampliado. Controles nuevos de 48 px o más; conservar al menos 44 px en los existentes hasta su revisión. Estados comprensibles mediante texto/icono además del color. Contraste AA, foco de teclado visible, movimiento reducido y áreas seguras. Revisar 360 px, tamaños habituales de teléfono y escritorio del coach.

Probar éxito, sin programa, programa futuro/finalizado, carga, error, pendiente local, pendiente de envío y confirmado. Las pantallas de referencia contienen el circuito principal; los estados restantes se especifican en journeys.md y se implementan con cada entrega funcional. Un prototipo no acredita el funcionamiento offline, permisos o guardado del producto.

## Calidad y publicación

Cada tarea sigue especificación, pruebas, implementación, verificación y commit. Mantener pruebas de reglas y seguridad, agregar E2E nativas sobre binarios y validación física; Expo web no las sustituye. Compatibilidad de API/borradores con versiones anteriores y pruebas destructivas solo en la pila aislada. No borrar datos interactivos o remotos.

Distribución: builds de desarrollo para ingeniería, preview instalable con bundle incluido para pruebas sin Metro y producción firmada para tiendas. Configuración local no significa disponibilidad para instalar. Identificadores propuestos se verifican antes de registrarlos; firma, cuentas y cuotas son requisitos de la fase de compilación. Ningún gasto se contrata sin autorización. Google Play puede requerir doce participantes durante catorce días según tipo/fecha de cuenta; verificarlo al preparar beta. Mantener política de privacidad, soporte y eliminación de cuenta coherentes con el comportamiento real.

Fuentes primarias: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/), [perfiles EAS](https://docs.expo.dev/build/eas-json/), [distribución interna](https://docs.expo.dev/build/internal-distribution/), [Apple](https://developer.apple.com/app-store/review/guidelines/), [Google Play](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en). Consultadas el 24 de octubre de 2026.

## Preparación local de T191

Conservar app.json como base y añadir app.config.js con variantes development/preview/production. Sin APP_VARIANT, conservar nombre, esquema y proyecto actuales para Expo Go. Identificadores locales propuestos com.domarchis.ironstrength, .preview y .dev; verificar disponibilidad y titular antes de registrarlos en Apple/Google. Variantes distinguen nombre y esquema; no comparten automáticamente sesión o borradores entre instalaciones.

Perfiles EAS: development con dev-client compatible SDK 58; preview release/internal APK y ad hoc iOS; preview-simulator solo simulador; production release/store AAB/iOS. Versionado local, sin autoenvío, autoactualizaciones, certificados o cambios remotos. Origen HTTPS actual explícito en los perfiles. Preview es aislamiento de instalación, no una base de datos de pruebas: los recorridos destructivos siguen usando únicamente la pila aislada. Herramientas no consumen builds remotos en esta tarea.

Validar configuración resuelta de cada variante, identidad EAS conservada, nombres/esquemas/IDs distintos, dev-client solo en perfil de desarrollo y rechazo de variantes desconocidas. Check móvil, doctor, exportaciones y regresión Expo web. Documentar que el simulador iOS no produce un instalador para iPhone y que registro de dispositivo/firma/cuenta se resuelven antes de T201.

## Extensión visual aprobada · T194

Después de revisar T190, el propietario aprobó llevar la referencia a las pantallas funcionales y pidió un check de serie pequeño y circular. Se adelanta T194 de forma independiente de acceso/cuenta: la implementación nativa conserva datos, navegación, contratos y recuperación; sus criterios están en design.md. El editor web queda en T200. La referencia de estilo está aprobada, mientras que la aceptación en dispositivos físicos continúa separada.

## T206 · Repaso de series y descanso

El propietario reportó fallos al registrar series o descansar. Revisar los recorridos antes de añadir funciones. Errores de entrada deben aparecer junto a la serie afectada, conservar sus valores y no marcarla ni iniciar descanso; al corregir los campos desaparece ese aviso. Conservar los fallos de almacenamiento globales y su recuperación, sin afirmar guardado antes de confirmarlo.

Durante un entrenamiento en curso, el descanso y sus controles permanecen visibles al desplazarse por las series, fuera del contenido desplazable y sin taparlo. Respetar teclado, áreas seguras y movimiento reducido. Ajustar, omitir y recuperar mantienen la hora absoluta de término; volver a la app no reinicia el tiempo. Desactivar el descanso del grupo (0 segundos) se respeta también en calentamientos; estos nunca avanzan la ronda. No cambiar la regla de autocompletar repeticiones vacías desde la prescripción ni las reglas de desmarcado existentes.

En la referencia HTML, conservar los pesos y repeticiones editados en memoria al cambiar tema o navegar entre vistas. Aclarar que su descanso es estático e ilustrativo; no confundirlo con el temporizador de Expo. Continúa sin persistencia, autenticación o escrituras de cuenta. No ampliar el prototipo a una segunda app funcional.

Aceptación: entradas inválidas con aviso local, corrección y completado; timer visible al volver a la primera fila, ajustes y recuperación con el mismo término; calentamientos con descanso de grupo desactivado; superserie por rondas y respuesta perdida sin duplicación. Check raíz/móvil, E2E Chromium/WebKit, exportación Hermes y revisión visual. Sin cambios de API/SQL ni datos remotos.

## T192 · Invitación y recuperación móvil

Reutilizar las invitaciones de siete días y recuperación de un solo uso actuales. El coach continúa creando y entregando los enlaces desde web, sin correo automático. El alumno puede abrirlos en la app instalada con su esquema propio o pegarlos desde Acceso móvil en Login (también en Expo Go). La versión web conserva sus formularios y añade una salida explícita para abrir la app.

Tres POST JSON versionados con cuerpo máximo de 16 KiB, sin cookies, caché ni credenciales administrativas en cliente: auth/invitation (consulta sin consumir), auth/register (mismo registerWithInvitation existente) y auth/reset-password (verifyOtp recovery + updateUser mediante cliente público). Se incorporan individualmente a la lista cerrada de rutas. Abrir un enlace de recuperación no verifica el OTP ni lo consume; solo el envío de una contraseña válida lo hace. No ampliar los tres propósitos autorizados del cliente administrativo.

Validar nombre 1–100 y contraseña 8–200 caracteres; confirmar contraseña en móvil. Tokens de invitación base64url de 43 caracteres y recovery hash hexadecimal de 56, como los enlaces existentes. Responder inexistente/usada/vencida con acción para volver al acceso o pedir otro enlace al coach. Ante respuesta perdida después de crear cuenta o cambiar clave, permitir entrar con los datos elegidos, sin afirmar que la operación se revirtió.

Aceptar solo enlaces HTTPS del origen configurado con /invite/<token> o /reset/<token>, o el esquema conocido de Iron Strength con ruta access y parámetros kind/token cerrados. Rechazar otros hosts, credenciales embebidas, fragmentos, parámetros duplicados o destinos arbitrarios. Tokens/contraseñas permanecen en memoria del formulario; no se guardan en SQLite, preferencias, analítica ni logs. Retirar la ruta que contiene el token después de éxito o cancelación. Una cuenta ya autenticada no cambia de identidad al abrir un enlace: debe gestionar su salida con las protecciones existentes de pendientes.

Al terminar se vuelve a Login con un motivo no secreto y se inicia sesión explícitamente con la contraseña elegida. Esto conserva el almacén de entrenamientos por cuenta; recuperar acceso no borra borradores ni crea otro usuario. Enlace reutilizado explica cómo entrar si la primera respuesta se perdió. Las rutas públicas de acceso no montan TrainingProvider ni leen registros de otra cuenta.

Aceptación: consulta de invitación no la consume; registro válido/competido/vencido; recuperación válida/reutilizada/contraseña inválida; enlace externo rechazado; vuelta a Login sin token; sesión existente protegida; recuperar la misma cuenta conserva el registro. Pruebas de API, cliente/parser, integración Auth/RLS solo en 55321 y E2E Chromium/WebKit. La apertura por esquema en iPhone/Android físicos se registra en T201–T202, sin equipararla a Expo web.

## T193 · Cuenta, datos y eliminación nativa

Cuenta conserva identidad/rol, apariencia y salida protegida; añade información local de privacidad y ayuda accesible también antes de entrar. Explicar qué datos están en Supabase, qué conserva el dispositivo, visibilidad del coach y diferencia entre salir, desinstalar y borrar cuenta. No publicar correos personales como soporte ni presentar este resumen operativo como la política legal final de T203. Exportar el historial conserva el recorrido web autenticado existente, indicado antes de borrar.

Solo el alumno puede eliminarse, conservando RF-48/DC-4. El coach propietario no se elimina desde la app; explicar la restricción. POST account/delete autenticado por Bearer, cuerpo estricto de hasta 16 KiB con confirmación BORRAR y sin IDs de destino. Verificar rol antes de tocar fotos. Reutilizar deleteOwnAccount con el cliente del alumno: archivos privados primero, RPC delete_my_account después, sin nuevas claves administrativas ni SQL. La confirmación incluye entrenamientos, planes, medidas, fotos, logros, comentarios y registros locales pendientes. Un fallo al borrar archivos no afirma que la cuenta se eliminó ni que todas las fotos siguen intactas; puede haberse borrado una parte y se permite reintentar.

Antes de enviar, guardar y releer un recibo local v1 de eliminación (ID de cuenta y fase requested/confirmed, sin nombre, correo o credenciales). Si falla esa protección no llamar al servidor. Mientras la petición está en curso bloquear otras acciones; antes vaciar las escrituras del borrador y no iniciar con sincronización en vuelo. Un resultado incierto conserva datos y recibo: ofrecer conservar los datos y volver, o confirmar expresamente BORRAR LOCAL, aclarando que esto no acredita el borrado remoto. Un recibo confirmado permite completar/reintentar solo la limpieza local, también tras cerrar y abrir. Formato desconocido se conserva y pide una versión compatible.

Solo después de confirmación del servidor (o descarte local explícito ante incertidumbre) eliminar el almacén de entrenamientos de esa cuenta, con relectura; conservar otras cuentas y la apariencia del dispositivo. Cerrar la sesión solo si corresponde a la cuenta eliminada. Si falla la limpieza conservar el recibo para reintentar, sin repetir automáticamente el borrado remoto. La app vuelve al acceso con un mensaje que distingue borrado remoto confirmado de limpieza local solamente. Las credenciales de una identidad diferente no se eliminan.

Aceptación: alumno elimina únicamente su cuenta; coach/ausencia de Bearer/confirmación incorrecta se rechazan antes de tocar datos; fallo remoto no borra registros locales; fallo local tras éxito recupera la limpieza al reabrir sin repetir la petición; respuesta perdida no afirma éxito; almacenamiento desconocido conserva origen; limpieza afecta solo a la cuenta indicada y mantiene el tema. Integración destructiva exclusivamente en 55321; pruebas de interfaz en ambos motores con accesibilidad y 360 px. Publicación de API y aceptación física separadas.
