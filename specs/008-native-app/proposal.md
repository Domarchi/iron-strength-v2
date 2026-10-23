# App Android e iPhone — propuesta de arranque

Objetivo confirmado por Joaquin el 23 de octubre de 2026: aplicaciones para las tiendas de Android e iPhone. El coach mantiene la planificación en la web; el coach también puede entrenar en móvil. Se conserva Azul atleta y el Supabase exclusivo de Iron Strength. Este documento inicia el trabajo de arquitectura; todavía no hay un binario ni una app enviada a tiendas.

## Tecnología aprobada

React Native con Expo para una interfaz móvil propia, reutilizando la lógica TypeScript de dominio, contratos y tipos de Supabase. La web Next.js sigue funcionando y no se convierte en exportación estática. El SDK de Expo y React Native se fijarán en versiones compatibles al crear el proyecto; la elección React Native con Expo fue aprobada expresamente el 23 de octubre de 2026.

La alternativa es una interfaz web empaquetada con Capacitor, pero esta app usa SSR, cookies y Server Actions: exige adaptar esas fronteras y el almacenamiento, no basta con apuntar a Vercel. La documentación de Capacitor reserva server.url para desarrollo; por eso se recomienda el cliente nativo separado. Esta elección es una recomendación de arquitectura, no un requisito de Expo o de las tiendas.

## Primera entrega utilizable

1. Proyecto móvil independiente y configuración local/de pruebas separada de producción. Identidad visual compartida, navegación móvil y temas Claro/Oscuro/Sistema.
2. Acceso con la cuenta existente, comprobación de perfil activo y cierre de sesión. Conservar la protección de intentos de acceso actual mediante un contrato HTTP explícito; no llamar a Server Actions como si fueran una API móvil ni incluir secretos administrativos en el binario.
3. Mi semana y consulta de rutina sin iniciarla, con sesiones, superseries, alternativas y objetivos por serie. El primer circuito se valida con coach y alumnos sintéticos en el entorno aislado.
4. Registro nativo: ejercicio actual, teclado numérico, series, descanso por plazo absoluto y borrador recuperable. Compartir reglas de rondas, límites, fechas y resumen; adaptar los componentes de pantalla, sin importar DOM o APIs de Next.js.
5. Cierre, sincronización idempotente y resultado: mismo ID estable y confirmación del servidor antes de retirar el pendiente. Adaptar el endpoint para identidad móvil autenticada y mantener su contrato web, permisos y reintentos.

## Entregas siguientes

- Descarga de semana y cola transaccional en SQLite, aisladas por cuenta. Los formatos de dominio se versionan; IndexedDB y service workers siguen siendo exclusivos de la web. No trasladar silenciosamente un borrador del navegador a otro dispositivo.
- Historial, progreso, comentarios, cuenta y medidas/fotos, conservando permisos y la planificación web. Haptics y aviso local de descanso opcionales, probados con la app en segundo plano y con permisos rechazados.
- Pruebas en dispositivos Android/iPhone y distribución interna. Preparar identificadores, firma y cuentas del propietario antes de solicitar publicación en Google Play y App Store. No crear cuentas de pago ni contratar compilación sin aprobación.

## Criterios del circuito nativo completo (entregas sucesivas)

Entrar con la misma cuenta → consultar semana → abrir rutina sin crear un borrador → entrenar → cerrar → ver una única copia en web. Recargar/reabrir conserva datos; otra cuenta no accede a ellos; la ausencia de red conserva el registro. Borradores y credenciales usan almacenes separados y solo se retiran tras confirmación o descarte explícito. Mantener los límites y la zona America/Santiago. La interfaz web y los registros existentes no cambian por instalar el cliente móvil.

## Fronteras que se deben resolver antes de implementar

- src/domain y las funciones de datos que reciben un cliente autenticado son candidatos a compartir; separar importaciones de servidor y navegador antes de empaquetarlas.
- El login actual usa Server Actions y control de intentos en servidor. La sincronización actual exige sesión web y mismo origen; el cliente nativo necesita autenticación móvil explícita con verificación del usuario, sin ampliar los puntos de uso administrativo.
- La persistencia de sesión usa almacenamiento seguro del sistema; las rutinas y la cola local no deben contener claves administrativas ni credenciales. Validar cierre, cambio de cuenta y eliminación local con pendientes.
- React Native/Expo está aprobado para la primera entrega de consulta: acceso, Mi semana y rutina. El SDK compatible, Router y SecureStore se validan en spec.md. No se crearon servicios de pago ni identificadores de tienda.

Fuentes oficiales consultadas el 23 de octubre de 2026: [Expo con Supabase](https://docs.expo.dev/guides/using-supabase/), [configuración de Capacitor](https://capacitorjs.com/docs/config), [guía de revisión de Apple, sección 4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality). La reutilización y el orden de entregas son decisiones propuestas para este repositorio.
