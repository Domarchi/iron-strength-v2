# Spec 012 · Estado real del plan (12-nov-2026)

Rama `codex/redesign-forja-20261112`. Nada está publicado ni empujado. Una tarea figura como hecha solo si tiene código, pruebas y commit; «parcial» dice qué falta; «bloqueada» dice qué se necesita de fuera.

| Tarea                           | Estado                      | Notas                                                                                                                     |
| ------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| T236 Auditoría                  | Hecha (con huecos)          | 84 capturas, 31 defectos; faltan ficha de ejercicio, organizar/agregar/reemplazar, errores/offline y medición en teléfono |
| T237 Marca                      | Hecha                       | A · Forja elegida                                                                                                         |
| T238 Dependencias nativas       | Hecha                       | Falta confirmar en Expo Go del teléfono si basta o se necesita build de desarrollo                                        |
| T239 Sistema de diseño          | Hecha                       | 22 componentes + galería `/design`; las pantallas actuales aún no los usan                                                |
| T240 Paleta y navegación        | Hecha                       | Paleta, fuentes, peligro y «volver» aplicados a toda la app. Cabeceras nativas con título no se rediseñaron               |
| T241 Registro                   | Hecha (parcial vs. el plan) | Sugerido atenuado, anillo; la cabecera con menú «···» no se hizo                                                          |
| T242 Teclado/copia rápida       | Parcial                     | Ajuste ±2,5 kg; no hay teclado numérico propio                                                                            |
| T243 Descanso                   | Parcial                     | Anillo, vibración, pantalla encendida; falta aviso en segundo plano (requiere notificaciones)                             |
| T244 Resultado                  | Parcial                     | Esfuerzo con un toque, resumen sin ceros; faltan récords destacados y comparación con la sesión anterior                  |
| T245 Inicio                     | Parcial                     | Tira de la semana; sin racha ni tarjetas (la API no entrega racha confirmada)                                             |
| T246 Biblioteca/editor          | Parcial                     | Texto del selector; faltan ocultar demos y rediseño de filas                                                              |
| T247 Ficha de ejercicio         | No iniciada                 | Depende de D4 (contenido)                                                                                                 |
| T248 Historial                  | Parcial                     | Estado vacío con acción; faltan calendario con tipos y menos «Nota conservada»                                            |
| T249 Progreso                   | Parcial                     | Plurales, vacío con acción, gráfico con máx/mín/valor actual; faltan panel, mapa muscular y selección por toque           |
| T250 Cuenta                     | Parcial                     | «Mis ejercicios» y «Privacidad y ayuda» como filas con flecha; falta el resto de la lista y la tarjeta de perfil          |
| T251 Bienvenida y recordatorios | No iniciada                 | Recordatorios necesitan `expo-notifications` (permiso nuevo → afecta formularios de privacidad de tiendas)                |
| T252 Push de comentarios        | Bloqueada                   | Credenciales Apple/Google, servicio de envío y migración (D7)                                                             |
| T253 Medidas y fotos nativas    | No iniciada                 | Requiere API móvil nueva y almacenamiento privado; hoy solo web                                                           |
| T254 Logros y racha nativos     | No iniciada                 | Requiere endpoint o cálculo sobre el progreso                                                                             |
| T255 Progresión y cronómetros   | No iniciada                 | La regla de progresión existe en el dominio web                                                                           |
| T256 Check-in semanal           | Bloqueada                   | Migración remota con respaldo/ensayo previos y autorización                                                               |
| T257 Coach en el teléfono       | No iniciada                 | API móvil de alumnos para coach + pantallas                                                                               |
| T258 Biometría                  | No iniciada                 | Dependencia nueva (`expo-local-authentication`)                                                                           |
| T259 Rendimiento                | No iniciada                 | Requiere teléfono real para medir                                                                                         |
| T260 Accesibilidad con lectores | Bloqueada                   | VoiceOver/TalkBack en teléfonos reales                                                                                    |
| T261 Textos                     | No iniciada                 | Revisión pantalla a pantalla                                                                                              |
| T262 Monitoreo                  | Bloqueada                   | D6: elegir servicio y declarar en privacidad                                                                              |
| T263 Web del coach con Forja    | No iniciada                 | PR19 aún en borrador y con CI en rojo                                                                                     |
| T264 Regresión y 4 teléfonos    | Bloqueada                   | Teléfonos reales                                                                                                          |

## Pendiente fuera de esta rama

- **PR19 (editor del coach):** el fallo de WebKit era axe leyendo contraste a mitad de una transición de tema; las 3 pruebas del CI se estabilizaron en el commit cc33e91 (empujado, a la espera de un CI nuevo).
- **Publicación:** 16 migraciones locales pendientes de aplicar en remoto frente a la copia de seguridad; builds de tienda, cuentas Apple/Google, beta y revisión física siguen sin empezar (ver `docs/native-release-plan.md`).
