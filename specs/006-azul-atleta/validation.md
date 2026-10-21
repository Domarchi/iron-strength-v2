# Validación

T167: especificación escrita antes de código. `npm run check` en verde el 21 de octubre de 2026 (458 pruebas unitarias, tipos, lint, formato y build). No se modificaron pantallas ni base de datos.

T168: pendiente. La aceptación en teléfonos físicos sigue separada de la emulación.

## T168 — Implementación y revisión

Se reutilizan los componentes y contratos existentes. No hay cambios de esquema, permisos, formatos de borrador ni cola. Mi semana lee además las series prescritas para mostrar el conteo real, sin sumar alternativas. Integración de esa lectura: **14 pruebas aprobadas** en la base aislada 55321. Las dos rutas de imagen fallaron antes de implementar su contrato público y ahora están incluidas de forma explícita; rutas vecinas siguen protegidas en el contrato.

El inicio usa cabecera marina, calendario y hoja clara con la sesión destacada; el registro coloca sus series antes de los controles de contexto, conserva el estado y muestra descanso y Deshacer sin superponer sus acciones. El coach tiene barra lateral desde 1024 px, cinta de semanas y biblioteca junto al editor desde 1280 px. La biblioteca utiliza la misma búsqueda, selección y escritura que en móvil, y sus estados accesibles siguen la distribución real. Los editores permanecen montados al cambiar de semana. El catálogo se renderiza solo en la semana visible y cuando se despliega en móvil; la selección permanece en el estado del editor, con una comprobación E2E de ida y vuelta entre semanas. Los enlaces de sesiones recorren los editores existentes sin desmontarlos.

### Comparación con A

Revisadas capturas reales de inicio y registro a 390 × 844 y coach a 1440 × 1000; comprobación a 360 px en ambos temas. Las imágenes del producto se generaron con ImageGen integrado; rutas y prompts en [assets.md](assets.md). La referencia aprobada está conservada en Git. Las capturas de comprobación se guardan en `outputs/azul-atleta/` del directorio padre (datos sintéticos de E2E).

Adaptaciones deliberadas: nombres, fechas, cantidades y estados proceden del usuario; no hay avatares de alumnos ni disponibilidad sin conexión ficticios. Se conserva Cuerpo en la navegación y Cuenta en la cabecera. Notas, rangos mínimo/máximo, alternativas, selección múltiple y acciones por teclado siguen disponibles aunque la imagen conceptual no dibuje todos esos controles. Las otras miniaturas conservan las ilustraciones SVG propias; la imagen de sentadilla no se reutiliza para movimientos distintos. La preferencia de tema del sistema sigue vigente; el registro tiene una paleta marina local en ambos temas.

Durante la revisión se corrigió el azul de texto sobre fondos suaves (iniciales del panel del coach) y los contrastes del día actual y del texto secundario del selector de semana, superposición de Deshacer con el descanso y el fondo de semanas terminadas/cortas. Se conserva el encabezado accesible Sesión A y se actualiza la prueba que comprobaba los colores de la paleta anterior. El caso nuevo finaliza y vuelve a una semana completa para auditarla también. Los recursos se comprueban sin sesión, en la lista cerrada del worker y durante una apertura sin transporte. No se amplía la caché a páginas privadas.

### Controles finales

`npm run check`: 462 unitarias, formato, lint (sin errores; cinco advertencias anteriores), tipos y build en verde. Una pasada enfocada previa aprobó 38 E2E Chromium/WebKit. Suite completa final: **145 E2E aprobadas, cero fallos, sin reintentos, en 16,2 minutos**, Chromium y WebKit. Se omite únicamente en WebKit el gesto continuo que requiere CDP; ese caso pasa en Chromium. Registro: `work/t168-e2e-final.log` en el directorio padre. `npm run check` final: `work/t168-check-final.log`; integración: `work/t168-week-int.log`.

Vista previa del puerto 3000 recompilada, con inicio y editor abiertos. La comparación de datos interactivos confirma perfiles, programas, prescripciones y entrenamientos idénticos a la referencia: `91f59c7cb0c45efd96eb0ce57a4e77c68d3c31e6879d8dbc7e6931137cecbf1a`. No se ejecutaron semillas ni pruebas destructivas en esa base, ni cambios en producción.

La emulación no acredita aceptación en teléfonos físicos. Esos controles y los pendientes de cuentas reales de T166 continúan documentados en spec 005.

La vista previa final usa BUILD_ID `1633dbf416c14a95b9c0ae4662825a7e`. Azul de texto `#005fd9`: 5,77:1 sobre blanco y 4,97:1 sobre su fondo al 10%; acción destacada `#0068ec` con blanco: 5,01:1. La aprobación de T168 corresponde a implementación y prueba local; no se publicó esta revisión visual en Vercel.
