# Recorridos sobre el APK nativo

Estos flujos de Maestro usan exclusivamente la instalación local `com.domarchis.ironstrength.quality`. No son pruebas de Expo web, no apuntan al APK preview del propietario y no deben ejecutarse contra producción. Preparar antes el Next de pruebas, Supabase aislado 55321 y las cuatro cuentas ficticias según [la guía de calidad](../../docs/native-quality.md).

Ejecutar los fragmentos en orden, con un solo controlador y un serial/AVD propio explícito. No ejecutar la carpeta completa automáticamente: el operador cambia la conectividad y conserva el estado entre fragmentos. No borrar datos para repetir un caso.

1. `login-routine.yaml`: instalación nueva/sin sesión; recibe EMAIL, PASSWORD y FIRST_NAME de una cuenta ficticia. Entra, consulta sin iniciar y descarga entrenamientos completos (catálogo, biblioteca, semana y contexto).
2. Activar modo avión y deshabilitar Wi-Fi; cerrar/reabrir el APK y comprobar cuenta/semana descargadas.
3. `offline-superset.yaml`: corredor tipado actual de la sesión A de la semilla (dos ejercicios de dos series, descanso 90 s y alternativa Press de banca inclinado). Completa la primera ronda; no repetir sobre una sesión ya avanzada porque el check permite desmarcar.
4. Completar la segunda ronda. Registrar el descanso antes/después de fondo y cierre/reapertura, contrastando el tiempo transcurrido y conservando la alternativa.
5. `close-offline.yaml`: cuatro series completadas, recibe PENDING_LABEL (por ejemplo, «1 registro pendiente»). Revisa cantidades, guarda localmente y vuelve a Inicio. Preparar una segunda sesión independiente antes de reconectar.
6. Reabrir con ambos pendientes, conectar y comprobar en el servidor aislado una sola fila por ID con sus series. Reintentar, abrir historial/progreso/comentarios y cambiar de cuenta tras resolver pendientes.

`assert-safe-area.py` analiza una jerarquía nativa capturada (UIAutomator o atributos equivalentes exportados por Maestro). Recibe `--top-inset` con los píxeles medidos de ese dispositivo; 136 px corresponde al Pixel 7 de este ensayo, no es una constante de la app. La vista desplazable debe empezar fuera de esa zona, también al abrir el teclado y desplazar contenido.

Se verificó Maestro CLI 2.11.0 mediante el SHA-256 de su release oficial. Las herramientas, APK, capturas, credenciales ficticias y registros quedan fuera de Git. Pasar las variables explícitas con -e; no definirlas también en env del flujo, porque esa definición puede prevalecer sobre la CLI. Usar CLI local, sin comandos cloud/login/analyze, con MAESTRO_CLI_NO_ANALYTICS=true, MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true y MAESTRO_DISABLE_UPDATE_CHECK=true. Un fallo de transporte del controlador se conserva como tal y se separa de un cierre del proceso de la app. La aceptación física y el CI continúan registrados por separado.
