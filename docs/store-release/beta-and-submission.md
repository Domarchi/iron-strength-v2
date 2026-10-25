# Beta y preparación de envío

Estado del 25 de octubre de 2026: hay un APK Android preview y controles de software/native QA; no hay IPA, envío a tiendas o aceptación física completa. T201/T202 conservan sus pendientes. Esta guía prepara el recorrido y no declara una beta ya ejecutada.

## Cuentas y participantes

El propietario confirmó que aún no tiene Apple Developer ni Google Play Console. No se compró una membresía o cuota. El acceso Apple solicitado sigue pendiente; no pedir contraseñas o claves por chat.

Google Play tiene una tarifa única de registro de 25 USD y exige verificación de identidad según el tipo de cuenta. [Alta oficial](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en). Una cuenta personal nueva requiere al menos doce testers inscritos de forma continua durante catorce días antes de solicitar acceso a producción. El coach y tres alumnos no alcanzan ese mínimo; deben participar personas reales adicionales, sin datos de otros alumnos ni actividad simulada. Cumplir el periodo permite solicitar acceso, no garantiza la aprobación. [Pruebas de cuentas personales](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

Mantener la primera validación del producto con el coach y sus tres alumnos. Registrar plataforma/dispositivo/build, acciones, problemas y feedback en cada recorrido de docs/native-quality.md y docs/phone-validation.md. Asignar programas reales solo a sus propietarios. Las cuentas/semillas de QA no se trasladan a producción.

## Artefacto y ficha

Los textos propuestos están en metadata.es-CL.json: nombre, subtítulo, descripción breve y completa. Los campos de contacto/URLs quedan nulos hasta confirmar valores reales. Texto revisado con límites actuales de nombre 30, subtítulo Apple 30, breve Google 80 y descripción Google 4000. [Ficha Google](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en-EN), [página de producto Apple](https://developer.apple.com/app-store/product-page/).

Seleccionar capturas funcionales, legibles y sin datos personales. Android se captura del APK; iPhone de la app iOS o simulador válido. No presentar capturas Android rotuladas como iPhone, pantallas del prototipo como funciones publicadas, ni indicadores ficticios como resultados de alumnos. Mantener el estilo negro/claro aceptado. Tamaños/formatos y cuestionarios se contrastan de nuevo con la consola del propietario al preparar el envío.

Preparar una cuenta de revisión dedicada y sin acceso a alumnos reales. Su programa debe permitir revisar el circuito vigente durante la revisión, sin depender de una semana ya vencida. Las credenciales se entregan por el campo privado de la tienda; no van al repo, capturas o chat. El acceso de revisión y los contenidos no se crean en producción sin su preparación concreta y autorización dentro de la entrega final.

## Condiciones para enviar

- CI operativo, aceptación física requerida registrada y ausencia de bloqueos en acceso, registro, recuperación y separación de cuentas.
- Política/soporte/eliminación públicos y funcionales; responsable/contacto confirmados y formularios ajustados a SDKs/datos reales.
- Paquete, versiones, permisos, firma, recursos y cuenta de destino comprobados. Conservar el artefacto probado; no sustituirlo por otro build sin nueva verificación.
- Cuenta de revisión y pasos concretos comprobados; ninguna contraseña o clave en archivos públicos.
- Propietario revisa ficha, capturas, acceso y artefacto antes del envío final. Registrar publicación por plataforma; un envío, TestFlight o APK no equivalen a disponibilidad pública en ambas tiendas.

Pendientes: cuenta Apple/Google, participantes y periodo que exija la consola, contacto público, retención/respaldo, iOS, teléfonos, resto del circuito T202 y permisos para el envío concreto. El código web/API publicado continúa siendo el artefacto L compatible.
