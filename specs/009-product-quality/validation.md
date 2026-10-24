# Validación de calidad de producto

## T189

Alcance, inventario por plataforma y recorridos contrastados con las rutas, contratos y spec 008 sobre d18526a. Check raíz aprobado el 24 de octubre de 2026: formato, lint sin errores (diez avisos existentes), tipos, 519 unitarias y build Next 16.4.3 con 64 recursos. Evidencia privada product-t189-check.log. Sin cambios de código, base o producción; no se añadieron tests que dupliquen documentación. El plan distingue funciones disponibles, pendientes y requisitos de firma/aceptación física.

## T190

Prototipo autónomo en mobile/public/design-review/index.html, sin API, autenticación, recursos externos o persistencia. Cuatro vistas y dos temas; cambios de serie, búsqueda y revisión de asignación simuladas. Marca DEMO visible en capturas. La aceptación visual del propietario permanece pendiente y T194 no se declara implementada.

Prueba previa en rojo por ausencia de referencia. Primer recorrido detectó colisión de una variable global del navegador; se corrigió y añadió captura de errores de ejecución. Axe detectó que la barra de avance carecía de rol: ahora expone progressbar y valores. No se desactivaron reglas.

Check raíz aprobado (519 unitarias, formato, tipos, lint sin errores con diez avisos previos y build); check móvil con 27 pruebas y un aviso previo de hooks. Ocho E2E Chromium/WebKit aprobadas sin reintentos en 41 s: ocho combinaciones visuales por motor con Axe A/AA/2.1AA, sin desbordamiento, navegación/serie/diálogo y ausencia de peticiones de escritura o almacenamiento. Revisión adicional a 360 px, objetivos táctiles y retorno del foco al cerrar con Escape. Editor de escritorio compactado después de revisar capturas; ocho E2E finales repetidas sobre ese ajuste.

Capturas finales inspeccionadas y conservadas fuera de Git en work/product-design. Prototipo remoto abierto en navegador de Codex y disponible temporalmente mediante el túnel Expo existente: https://vjnvtvu-domarchi-8081.exp.direct/design-review/index.html. Esto publica solo la referencia con datos ficticios en el servidor de desarrollo, sin desplegar la app o modificar producción. Evidencia privada product-t190-before.log, product-t190-ui-final.log, product-t190-root-check.log y product-t190-mobile-check.log. Sin base/migraciones: no se ejecutaron integración ni pgTAP.

## T191

Preparación local implementada con app.config.js, eas.json y expo-dev-client 58.0.15 instalado mediante expo install. Perfiles development, preview, preview-simulator y production. Nombres, esquemas e identificadores distintos; IDs propuestos sin registro remoto. Default conserva el nombre/esquema actuales de Expo Go. Los scripts habituales conservan --go; el cliente de desarrollo tiene un comando explícito separado.

Las tres configuraciones públicas resueltas con Expo CLI conservan owner domarchis y el mismo EAS ID. Preview y production desactivan developmentClient y conservan la API HTTPS. No hay autoenvío, updates, build remoto o firma. La configuración no acredita un instalador. Guía y requisitos en docs/native-distribution.md; disponibilidad de cuentas/identificadores, firma, archivo de subida y cuotas se verifican antes de T201. Preview comparte servidor real y no se usa para pruebas destructivas.

Cuatro pruebas previas cubren identidad/variantes, rechazo de valor desconocido y conservación de incrementos locales de buildNumber/versionCode. La regresión de incrementos pasó de rojo a verde al respetar valores locales existentes. Check móvil final con **31 pruebas**, lint sin errores (un aviso previo) y tipos. Check raíz completo aprobado con **519 unitarias**, diez avisos previos sin errores y build. **28 E2E Expo web** aprobadas en ambos motores, sin reintentos, en 3,3 min: veinte del producto y ocho de las referencias. Expo doctor **20/20** y exportaciones Hermes Android/iOS aprobadas; bundles release conservan las mismas huellas que T188 porque no se cambió la interfaz funcional. Se distinguen estos controles de la aceptación física y firma.

Auditoría del árbol móvil registra cinco avisos altos previos y dos moderados en @expo/ngrok/uuid; no hay críticos. Se documentan como revisión pendiente antes de distribución, sin forzar el downgrade incompatible que propone npm audit. Esta preparación no declara aprobada la distribución a tiendas. Evidencia privada product-t191-audit.json.

No se ejecutaron operaciones de Supabase/Vercel, pruebas destructivas, migraciones, registro de aplicaciones, certificados, builds de pago ni contratación de servicios. T191 solo prepara; T201/T202 y aceptación visual continúan pendientes. Evidencia privada product-t191-before.log, product-t191-version-before.log, product-t191-mobile-release.log, product-t191-root-check.log, product-t191-ui.log, product-t191-config-verification.json, product-t191-doctor.log y product-t191-bundle.log.

## Cierre de la referencia y conexión de desarrollo

Después de preparar variantes, el túnel se reinició explícitamente en Expo Go, sin CI ni APP_VARIANT heredada. Manifiestos SDK 58 con el nombre original y bundles iOS/Android responden 200; huellas iguales a T188 y sin referencia a secreto administrativo. El HTML del prototipo responde 200 en el mismo túnel. Evidencia privada product-t191-tunnel-verification.json; no se atribuye prueba física a la descarga.

La revisión del prototipo detectó que marcar una serie actualizaba el control pero dejaba estático el contador. Se añadió la aserción al recorrido existente (rojo), se sincronizó el resumen y la tarjeta de Inicio con el estado en memoria y se verificó en ambos motores (dos E2E aprobadas, 11 s). Sin escrituras, API o persistencia añadidas. Las capturas iniciales conservan el mismo aspecto. Check raíz repetido para el cierre; evidencia product-t190-count-before.log, product-t190-count-final.log y product-t190-count-check.log.
