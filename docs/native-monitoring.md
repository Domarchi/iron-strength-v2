# Monitoreo de errores de la app nativa (T262)

Estado: **código listo, desactivado**. No se envía ningún informe hasta que se configure un DSN. Decisión del propietario (13-nov-2026): Sentry, plan gratuito, sin datos personales.

## Qué hace el código

- `mobile/src/lib/monitoring.ts` inicia `@sentry/react-native` solo si existe `EXPO_PUBLIC_SENTRY_DSN`, la compilación no es de desarrollo y no es web.
- `mobile/src/lib/monitoring-scrub.ts` (con pruebas) elimina usuario, petición, contexto del dispositivo, etiquetas, migas de pan y datos extra, y oculta correos, UUID y tokens largos de mensajes y excepciones. No se activan trazas de rendimiento ni capturas de pantalla.
- No se instaló el plugin de Sentry para compilación (`app.json`): solo sirve para subir mapas de código fuente y necesita organización y token. Sin él, las pilas llegan sin símbolos; se resuelve al preparar el candidato de tienda.

## Lo que debes hacer tú para activarlo

1. Crear una cuenta gratuita en Sentry y un proyecto «React Native» (la clave pública, DSN, no es secreta pero tampoco se pega en el chat).
2. Añadir el DSN como variable `EXPO_PUBLIC_SENTRY_DSN` solo en los perfiles `preview` y `production` de EAS (en el panel de EAS, no en Git).
3. Publicar antes el texto de privacidad de abajo y actualizar el formulario de Data Safety / App Privacy de las tiendas (datos de diagnóstico, no vinculados a la persona, sin seguimiento).
4. Construir un candidato nuevo y comprobar con un error de prueba que el informe llega sin datos personales.

## Texto propuesto para la política (no publicado)

«Informes de fallos. Si la app falla, puede enviarse un informe técnico (tipo de error, versión de la app y sistema operativo) a nuestro proveedor de diagnóstico. El informe no incluye tu nombre, correo, entrenamientos ni identificadores de tu cuenta.»

## Límites

Sin probar con un DSN real ni en teléfono. El plan gratuito de Sentry tiene cupo mensual de eventos y retención limitada; no se verificó su condición vigente.
