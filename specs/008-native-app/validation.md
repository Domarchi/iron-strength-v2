# Validación — Primera entrega nativa

## T182–T183 · Especificación y API

Aprobación explícita de Expo y alcance de consulta registrada en spec.md. Pruebas del contrato escritas primero, fallo por módulo ausente conservado en evidencia privada; implementación después. Los siete casos unitarios cubren lista cerrada de rutas, privacidad, identidad, límites y errores. Integración real solo en 55321: cinco casos nuevos de permisos propios/ajenos, coach entrenando, intentos de login, perfil desactivado, renovación y salida sin revocar otra sesión web.

`npm run check`: aprobado, 513 unitarias, tipos, formato, lint sin errores (diez avisos existentes) y build Next 16.4.3 con 64 recursos públicos. Integración completa: 275 aprobadas. Cuatro E2E HTTP en Chromium/WebKit aprobadas sin reintentos: el proxy permite únicamente la frontera explícita, las cookies web no autentican al móvil, JSON privado/no-store sin Set-Cookie, cuerpos limitados, consulta propia y 404 ajena, ninguna escritura de entrenamiento y refresh revocado al salir.

No hay migraciones nuevas ni cambios de datos de producción. Las pruebas destructivas usaron exclusivamente la base aislada; no la app interactiva ni Supabase remoto. CI y aceptación física se mantienen como evidencias separadas.
