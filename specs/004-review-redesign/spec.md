# Spec 004 — Correcciones de revisión y rediseño

Solicitado el 2026-10-19. Amplía las specs 001–003. Dirección visual elegida por el usuario: clara y minimalista, con foco en legibilidad.

## Correcciones

- RF-6: cada fallo de login se cuenta de forma atómica, también si llega junto a otros fallos a instancias distintas del servidor. El quinto fallo bloquea 15 minutos. Los fallos que ya estaban en vuelo no acortan ni prolongan un bloqueo activo. La operación solo se puede ejecutar con `service_role`; nunca expone correos en claro.
- RF-22 y RF-24: una sesión ya iniciada puede recuperarse tras cambiar de semana. La ruta de una sesión antigua permite recuperar un borrador del propio usuario, pero no iniciar una sesión nueva. Mi semana ofrece acceso a los borradores pendientes, incluso de programas anteriores. Un entrenamiento terminado conserva su id, fecha y duración al reintentarlo. El servidor sigue validando la semana de inicio y la RLS.

## Rediseño

- Mantener los flujos, datos, etiquetas accesibles y permisos existentes.
- Paleta clara de fondo gris cálido, superficies blancas, texto oscuro y acento verde profundo; variante oscura legible según el sistema.
- Navegación reconocible, títulos con más jerarquía y espaciado consistente. En móvil se conserva la barra inferior y el modo enfoque durante el entrenamiento.
- Login con identidad de marca y formulario sencillo; Mi semana con resumen, próxima sesión destacada y progreso visible; panel del coach con información fácil de recorrer.
- Objetivos táctiles de 44 px, contraste AA, sin scroll horizontal desde 360 px y respeto de movimiento reducido.
- Sin dependencias nuevas, servicios de pago ni cambios a las reglas de entrenamiento.

## Validación

Pruebas de regresión para concurrencia, permisos SQL y recuperación entre semanas; `npm run check`; migraciones, pgTAP, integración y E2E contra Supabase local cuando Docker esté disponible. Registrar explícitamente las suites que el entorno no permita ejecutar.
