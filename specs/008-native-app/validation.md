# Validación — Primera entrega nativa

## T182–T183 · Especificación y API

Aprobación explícita de Expo y alcance de consulta registrada en spec.md. Pruebas del contrato escritas primero, fallo por módulo ausente conservado en evidencia privada; implementación después. Los siete casos unitarios cubren lista cerrada de rutas, privacidad, identidad, límites y errores. Integración real solo en 55321: cinco casos nuevos de permisos propios/ajenos, coach entrenando, intentos de login, perfil desactivado, renovación y salida sin revocar otra sesión web.

`npm run check`: aprobado, 513 unitarias, tipos, formato, lint sin errores (diez avisos existentes) y build Next 16.4.3 con 64 recursos públicos. Integración completa: 275 aprobadas. Cuatro E2E HTTP en Chromium/WebKit aprobadas sin reintentos: el proxy permite únicamente la frontera explícita, las cookies web no autentican al móvil, JSON privado/no-store sin Set-Cookie, cuerpos limitados, consulta propia y 404 ajena, ninguna escritura de entrenamiento y refresh revocado al salir.

No hay migraciones nuevas ni cambios de datos de producción. Las pruebas destructivas usaron exclusivamente la base aislada; no la app interactiva ni Supabase remoto. CI y aceptación física se mantienen como evidencias separadas.

## T184 · Cliente y pantallas

Cliente Expo SDK 57.0.31, React Native 0.86.3 y Router compatible; SecureStore para refresh token. Se reutilizan únicamente contratos y reglas puras desde src, nunca componentes de Next, DOM o código administrativo. React de la app móvil y de la web se instala por separado. Azul atleta claro/oscuro según sistema, recursos existentes, botones de al menos 44 px y estado vacío específico para coach/alumno.

`mobile/npm run check`: lint/tipos y once pruebas aprobadas. Incluyen red/401, formato futuro conservado, fallo de almacenamiento, respuestas tardías, renovación concurrente y reutilización de un token ya renovado. La prueba de navegador encontró Illegal invocation al invocar fetch como método: regresión añadida en rojo, corregida invocando el transporte como función, once pruebas verdes después. Expo web en Chromium/WebKit: cuatro casos aprobados, acceso/semana/rutina/alternativas/salida, recuperación de error, 360 px/oscuro y sin tokens persistidos en localStorage. Son datos sintéticos interceptados, distintos de la integración real de la sección anterior y de teléfonos físicos.

Exportación final de ambas plataformas aprobada: Android Hermes 3.454.447 bytes e iOS 3.109.522 bytes, con 35 recursos. No son binarios firmados. expo-doctor: 21/21 comprobaciones, después de corregir una copia transitiva de expo-font 58 por la versión 57.0.4 del SDK. Check de la raíz aprobado con 513 unitarias y build. La raíz excluye mobile de su TypeScript/lint y los recursos generados del formato; sus controles propios no se omiten.

Auditoría móvil sin auditoría forzada: siete avisos transitivos de producción (cuatro altos, tres moderados), sin críticos. node-forge 1.4.0 procede del tooling Expo CLI/firma de desarrollo y el aviso GHSA-86w9-cpqp-85rv aún no tiene parche publicado; no se usa en el cliente de sesión. decode-uri-component 0.2.2 llega vía query-string 7.1.3/Router y tiene GHSA-vcc3-ghjq-m6fr. Su parche 0.5.1 cambió de CommonJS a ESM: no se impuso un override incompatible ni se degradó Expo/actualizó Router a otro SDK. Revisar una actualización soportada y repetir verificación antes de distribuir en tiendas. Esto no cambia la auditoría sin avisos de producción de la web. La primera entrega es desarrollo/consulta, no aprobación de seguridad para tiendas.

Referencias oficiales consultadas: [SDK 57 Font](https://docs.expo.dev/versions/v57.0.0/sdk/font/), [Expo CLI](https://docs.expo.dev/more/expo-cli/), [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv) y [decode-uri-component](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr). No hay firma ni cuentas de tiendas configuradas; no se contrataron servicios ni se trasladaron cuentas de prueba.
