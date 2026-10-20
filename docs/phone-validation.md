# Prueba en teléfonos — Iron Strength

## Estado de la evidencia

La suite automatizada usa Chromium móvil y WebKit con perfil iPhone, cuatro cuentas aisladas y Supabase exclusivo de pruebas. Esto no acredita una prueba en un teléfono físico. Completar la tabla siguiente en Android/Chrome e iPhone/Safari después de publicar por HTTPS; registrar modelo, sistema, versión de navegador y fecha.

| Dispositivo real | Instalación | Registro y teclado | Arrastre táctil | Modo avión y sincronización | Estado        |
| ---------------- | ----------- | ------------------ | --------------- | --------------------------- | ------------- |
| Android / Chrome | Pendiente   | Pendiente          | Pendiente       | Pendiente                   | Por comprobar |
| iPhone / Safari  | Pendiente   | Pendiente          | Pendiente       | Pendiente                   | Por comprobar |

El arrastre táctil continuo automatizado utiliza CDP y se ejecuta en Chromium. Playwright no expone ese gesto en WebKit: allí se prueban el arrastre por puntero, el teclado y las acciones de orden. El gesto táctil real de Safari debe comprobarse en la fila de iPhone; no se considera aprobado por emulación.

La apertura sin conexión corta el transporte al servidor de pruebas mediante un proxy local por caso. Evita la limitación de [Playwright #42775](https://github.com/microsoft/playwright/issues/42775) sin omitir la recuperación: recursos ausentes y respuestas perdidas también se producen en ese transporte, incluidas las peticiones del service worker.

## Las cuatro cuentas

Un coach y tres alumnos, cada uno con su acceso privado. El coach también tiene Mi semana y puede entrenar. Usar los enlaces de invitación y recuperación del proyecto publicado. Las credenciales locales de demostración están en el archivo privado de acceso fuera del repositorio; no se suben a producción ni se comparten entre personas.

En el equipo de desarrollo, `scripts/prepare-four-local-accounts.ts` añade solo los alumnos que faltan hasta tres y asigna copias de una plantilla existente a quienes no tienen programa vigente o futuro. No modifica perfiles, contraseñas, rutinas ni entrenamientos existentes; rechaza hosts remotos. Usa la credencial del coach configurada para la semilla local y las asignaciones pasan por su cliente autenticado.

## Recorrido de prueba

1. Abrir la URL HTTPS de Iron Strength e iniciar sesión con una cuenta. En Android, instalar desde el menú del navegador; en iPhone, compartir y añadir a la pantalla de inicio. Abrir desde su icono y verificar que sigue apareciendo esa cuenta.
2. En claro y oscuro, revisar Mi semana, historial y una sesión a ancho de teléfono. Aumentar el tamaño del texto del sistema. Comprobar que botones, nombres y mensajes siguen legibles y que no hay desplazamiento horizontal.
3. Registrar peso con coma decimal y repeticiones usando el teclado móvil. Completar, editar y deshacer una serie. Comprobar foco y acceso a las acciones con el teclado abierto. Consultar el historial de un ejercicio sin perder el registro ni el descanso.
4. Ejecutar una superserie: calentamiento, primera ronda, descanso y otra ronda con cantidades desiguales. Cambiar una alternativa permitida antes de completar sus series. Recargar a mitad de entrenamiento y verificar orden, valores y plazo del temporizador.
5. Finalizar con esfuerzo y nota. El alumno ve el resumen y el coach abre ese entrenamiento, comprueba la sustitución y responde mediante comentarios. Repetir con cada alumno y con el entrenamiento propio del coach. Una cuenta de alumno no debe abrir un enlace privado de otro alumno ni del coach.
6. En el editor, probar arrastre lento y rápido con el dedo, desplazamiento automático y cancelación. Mover un grupo completo, sacar un integrante explícitamente y editar una semana futura. Cerrar/reabrir con cambios pendientes y recuperar el borrador. Dos pestañas deben mostrar conflicto en lugar de sobrescribir.
7. Con conexión, elegir **Descargar semana** y esperar **Disponible sin conexión**. Cerrar todas las ventanas de la app, activar modo avión y abrir desde su icono. Iniciar una sesión vigente, registrar series y finalizar. Cerrar y volver a abrir: el registro pendiente debe seguir visible.
8. Desactivar modo avión con la app abierta. Esperar confirmación o usar **Sincronizar ahora**. Abrir historial y comprobar una sola copia, con fecha, duración, sustitución y nota originales. Si la sesión expiró, volver a entrar con la misma cuenta y reintentar; no borrar el registro pendiente.
9. Intentar cerrar sesión con un entrenamiento o una edición pendiente. Volver debe conservarlo; sincronizar debe confirmar el registro antes de salir. Probar eliminación local solo con datos de prueba. Después de salir, ninguna otra pestaña debe seguir mostrando datos de esa cuenta.
10. Descargar una versión nueva mientras existe un borrador iniciado. Debe conservar la versión anterior hasta terminar o descartar. Tras finalizar, actualizar la descarga y repetir la apertura sin Internet.

## Registrar incidencias

Anotar cuenta/rol, dispositivo, fecha, pantalla, pasos y resultado esperado/obtenido. Evitar contraseñas, claves, fotos personales o cookies en capturas. La URL pública y la fecha de publicación se incorporan a la guía de despliegue al verificarse; `127.0.0.1` corresponde al computador y no sirve como URL del teléfono.
