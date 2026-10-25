# Inventario por plataforma

Estado del código revisado el 24 de octubre de 2026 sobre d18526a. Disponible significa implementado y con controles locales documentados; no acredita aceptación física completa ni publicación del cliente nativo en tiendas.

| Capacidad                         | Web                                | Android/iPhone actual                                    | Trabajo siguiente                                                                       |
| --------------------------------- | ---------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Acceso y sesión                   | Disponible                         | Disponible con renovación y SecureStore                  | Validación nativa firmada y estados de cuenta.                                          |
| Invitación/recuperación           | Rutas invite/:token y reset/:token | Acceso móvil deriva al coach/web                         | T192: recorrido móvil completo sin exponer tokens.                                      |
| Mi semana y consulta              | Disponible                         | Disponible                                               | Refinar siguiente acción y estados.                                                     |
| Registro, rondas y alternativas   | Disponible                         | Disponible, comparte reglas                              | Mantener comportamiento y verificar teclado/segundo plano físicamente.                  |
| Recuperación y envío              | Borradores/cola con protección     | Registro activo persistente, payload estable y reintento | No confundir este registro con descarga de semanas.                                     |
| Descargar y abrir semana sin red  | Disponible en interfaz offline web | Pendiente                                                | T197–T199, SQLite y migraciones verificadas.                                            |
| Historial y detalle               | Disponible                         | Disponible y paginado                                    | Navegación continua con progreso/comentarios.                                           |
| Progreso                          | Periodos y evidencia               | Mejores marcas, sin gráficos por periodos                | T196, cálculos y navegación con datos reales.                                           |
| Comentarios de seguimiento        | Disponible                         | Pendiente                                                | T195, permisos y estado de lectura.                                                     |
| Medidas/fotos                     | Disponible, recursos privados      | Pendiente                                                | Completar recorrido y permisos antes de incluirlos en v1.                               |
| Cuenta y eliminación              | Disponible                         | Parte de gestión abre web                                | T193, revisar datos/pérdida de pendientes con confirmación.                             |
| Planificación y asignación        | Disponible en coach                | Enlace a web                                             | T200, conservar coach de escritorio.                                                    |
| Claro/oscuro/sistema              | Disponible                         | Disponible y persistente                                 | Consolidar referencia y estados.                                                        |
| Aviso de descanso fuera de la app | No es requisito base web           | No implementado; plazo se conserva                       | Evaluar aviso local opcional con permisos rechazados; no prometer ejecución permanente. |
| Instalación                       | PWA y web publicada                | Expo Go de desarrollo                                    | Preparar perfiles, firma, binarios y tiendas.                                           |

## Contratos que se conservan

API móvil v1 en /api/mobile/v1, JWT/perfil activo y clientes autenticados con RLS. Identidad derivada del servidor incluso para el coach entrenando. Nunca incluir claves administrativas en binarios. Las nuevas funciones se prueban contra alumnos propios y ajenos en la base aislada.

Una sesión activa por cuenta y dispositivo, ID estable, snapshot de prescripción, revisión de cierre y payload congelado. Borradores y credenciales separados. No retirar un pendiente antes de confirmación o descarte explícito. No trasladar silenciosamente datos del navegador al cliente nativo.

La versión pública web/API permanece en Vercel; Supabase y las asignaciones reales no se modifican al explorar las referencias. Los datos de las pantallas de diseño son ficticios.

## Actualización T192–T196 · 24 de octubre de 2026

El inventario inicial anterior es la línea base de T189. El cliente ya incorpora invitación/recuperación propias (T192), privacidad y eliminación protegida (T193), comentarios con no leídos y borrador persistente (T195), y progreso por periodos con evidencia (T196). Los controles de software están en validation.md; publicación y aceptación física se registran por separado. Por decisión del propietario, medidas/fotos permanecen en web en esta versión y no se solicitan permisos móviles de cámara/galería. La descarga/apertura sin conexión sigue pendiente de T197–T199.
