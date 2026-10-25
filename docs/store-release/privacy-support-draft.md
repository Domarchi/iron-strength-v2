# Privacidad, soporte y eliminación — borrador T203

Estado: material de preparación de formularios de tiendas. El propietario autorizó el 25-oct-2026 joaquindomarchi@gmail.com como correo público; responsable Joaquín Domarchi, nombre proporcionado previamente. Las páginas /privacy, /support y /delete-account están implementadas y pendientes de verificación/publicación. Este inventario no sustituye la política que se sirve desde esas páginas ni los formularios reales de las consolas.

## Información del servicio

Iron Strength permite al coach preparar programas y al alumno registrar entrenamientos y revisar resultados. El coach también puede entrenar con su propia cuenta. La app usa la cuenta existente; el acceso inicial requiere una invitación. La planificación del coach, medidas y fotos continúan en web.

Responsable: Joaquín Domarchi. Contacto público autorizado: joaquindomarchi@gmail.com. Fecha de vigencia del contenido preparado: 25 de octubre de 2026.

## Datos y finalidad

| Datos                                                | Uso y destino actual                                                          | En el dispositivo                                                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Nombre, correo e identificador de cuenta             | Acceso, relación con el coach y separación de datos en Supabase Auth/Postgres | Perfil verificado y credencial de renovación en SecureStore; contraseña y token de acceso no se persisten por la app |
| Programas, ejercicios, series, repeticiones y cargas | Planificar, registrar y consultar resultados, historial y progreso            | Descarga de semana y contexto reciente por cuenta en SQLite                                                          |
| Esfuerzo y nota opcionales, comentarios              | Seguimiento y conversación entre alumno y coach                               | Borradores y envíos pendientes protegidos por cuenta hasta confirmación                                              |
| Preferencia de apariencia                            | Claro/oscuro/sistema                                                          | Preferencia del dispositivo que puede permanecer al salir                                                            |
| Medidas y fotos de la web                            | Seguimiento privado del alumno y su coach en el servicio existente            | La app nativa v1 no las registra ni pide cámara/galería                                                              |
| Registros técnicos del servicio                      | Operación, seguridad y resolución de errores por Vercel/Supabase              | Revisar inventario y retención reales antes del formulario de tiendas                                                |

El alumno accede a sus datos y el coach a los alumnos a su cargo. Los otros alumnos no reciben sus registros. Las reglas se comprueban en la base con RLS, no solo en la interfaz. El servicio se comunica por HTTPS; no se promete cifrado de extremo a extremo ni una auditoría sin pendientes.

En esta versión no se integra HealthKit/Health Connect ni un SDK de anuncios o seguimiento publicitario. Esto no sustituye declarar los datos de ejercicio introducidos por el usuario o las prácticas de proveedores. Revisar el binario y la configuración final antes de completar App Privacy/Data safety.

## Conservación, salida y eliminación

La app conserva datos locales de la cuenta para retomar registros y abrir semanas descargadas. Requiere una primera entrada con conexión y una descarga previa. Los cierres se envían mientras está abierta y puede reintentarse manualmente. La confirmación del servidor es distinta del guardado local.

Salir retira el acceso local y protege la separación de cuentas; antes debe resolverse un registro pendiente o confirmarse su descarte. Descartar una copia local no borra un entrenamiento que ya alcanzó el servidor. La apariencia se conserva aparte.

El alumno puede solicitar el borrado autenticado desde Cuenta. Se confirma de forma explícita; la operación incluye los datos asociados y archivos privados previstos por el servicio. Un fallo no se presenta como eliminación terminada. El coach propietario mantiene la restricción del producto y debe disponer de un recorrido de soporte concreto antes de publicación.

El propietario eligió respaldos locales cifrados en F.R.I.D.A.Y., semanales y antes de migraciones, con conservación de 30 días. Copia manual nueva verificada; programación local de respaldo semanal y revisión diaria de caducidad activada, con primera caducidad ejecutada sin vencidos y primera copia semanal programada pendiente. No hay copia externa. Si no existe una copia válida vigente, la limpieza conserva la última disponible y requiere atención; interrupciones del equipo o acceso también pueden retrasarla. Esta decisión no fija la retención de registros técnicos. La política pública explica ese objetivo y sus excepciones; verificar los siguientes resultados e inventariar las copias manuales por separado. docs/backup-restore.md exige conciliar solicitudes verificadas de eliminación antes de promover una restauración; ese control manual no equivale a un registro automático de eliminaciones. No prometer borrado inmediato de todas las copias históricas, custodia independiente o un plazo máximo ya acreditado si no existen.

## Ayuda propuesta

- Acceso: pedir al coach una invitación o enlace de recuperación; abrirlo desde «Tengo un enlace de mi coach». Nunca enviar la contraseña a soporte.
- Sin conexión: descargar antes la semana, conservar la app instalada y comprobar los estados de guardado. Abrir con conexión para enviar los pendientes.
- Error o cierre: indicar plataforma, versión/build, acción que se intentó y texto del error. No pedir JWT, credenciales, notas, fotos o logs íntegros.
- Contacto: joaquindomarchi@gmail.com, expresamente autorizado. No se promete un plazo de respuesta.

La página pública de eliminación debe identificar Iron Strength, explicar qué se borra/conserva y ofrecer un acceso real al recorrido autenticado y una vía para quienes no pueden entrar. Leer la página no ejecuta el borrado. Las solicitudes anónimas no eliminan cuentas sin verificar identidad. Google exige un recurso web además del recorrido interno cuando la app permite crear cuentas. [Requisito oficial de eliminación](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

## Preparación de formularios de tiendas

Nombre/correo, ID de usuario, información de ejercicio y contenido de notas/comentarios se vinculan a la cuenta para la funcionalidad del producto. Revisar las categorías concretas y los registros técnicos de terceros antes de marcar opciones definitivas. No seleccionar «no recopilamos datos» por usar Supabase, ni anunciar permisos de fotos/salud que la app nativa no tiene. [App Privacy de Apple](https://developer.apple.com/app-store/app-privacy-details/).

Este documento sigue siendo material de preparación de las declaraciones de tiendas; las categorías finales, configuración real de registros técnicos, binario final y formularios requieren su revisión. La publicación web se registra por separado.

## Evidencia nativa iOS · 25 de octubre de 2026

La compilación para simulador cf066780-0f66-4f6b-bde1-6454071513a1 terminó desde d34366d: paquete com.domarchis.ironstrength.preview, versión 0.1.0/build 1, plataformas iPhoneSimulator y Mach-O arm64/x86_64 de simulador. Incluye once manifiestos xcprivacy y dieciséis declaraciones de acceso a API requerida; ninguno declara tracking o tipos de datos recogidos. Esto describe los manifiestos incluidos y **no permite marcar que la app no recoge datos**: el acceso y los entrenamientos/comentarios sí se envían a la API según el recorrido descrito arriba.

Info.plist incluye NSFaceIDUsageDescription del SDK de almacenamiento; no incluye claves de uso de cámara o fototeca. Contrastar comportamiento del binario firmado para iPhone y formularios de tienda antes del envío. Compilar e inspeccionar en Linux no acredita ejecución, tráfico real, aceptación de permisos o aprobación de privacidad. Esta evidencia del simulador no acredita la política publicada ni formularios enviados; la autorización posterior de contacto se registra arriba.
