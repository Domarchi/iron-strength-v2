# Privacidad, soporte y eliminación — borrador T203

Estado: material de preparación de formularios de tiendas. El propietario autorizó el 25-oct-2026 joaquindomarchi@gmail.com como correo público; responsable Joaquín Domarchi, nombre proporcionado previamente. Las páginas /privacy, /support y /delete-account están publicadas en https://iron-strength-seven.vercel.app y verificadas sin sesión sobre M (25-oct-2026). Este inventario no sustituye la política que se sirve desde esas páginas ni los formularios reales de las consolas.

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

## Registros técnicos: alcance de lo comprobado

La revisión del 25-oct-2026 distingue las ventanas de consulta documentadas de un compromiso de eliminación. Supabase denomina sus cifras por plan tiempo accesible; la CLI autenticada no devuelve plan/conservación en sus listados y el panel pidió iniciar sesión. No se ha acreditado un plazo efectivo propio del proyecto ni la eliminación de toda la telemetría. docs/operations.md conserva las fuentes y ese límite. La conservación de respaldos propios de treinta días y sus excepciones no se traslada a estos registros. No marcar formularios finales con una cifra supuesta o ausencia de datos técnicos; completar esa verificación cuando el panel esté disponible, sin contratar ampliaciones o drenajes por defecto.

Actualización posterior del 25-oct-2026: el conector Supabase autorizado sí acreditó el proyecto exclusivo y su plan free/tier_free. La ventana de un día consultable documentada para Free puede atribuirse a ese plan, conservando su diferencia frente al borrado de toda la telemetría del proveedor. No se acreditó un plazo máximo de eliminación interna, ni se modificaron formularios/política pública, configuración o destinos. El acceso del navegador no impide esta comprobación y continúa aplazado por separado.

## Inventario actualizado · T221/preview5, 29 de octubre

El registro nativo ahora también incluye rutinas personales, ejercicios propios y valores manuales de duración/distancia, además de cargas/repeticiones y notas/esfuerzo. Conservan la finalidad de entrenamiento y la relación privada entre alumno y coach; este inventario debe incluirse al completar las categorías de ejercicio/contenido de usuario de las consolas.

El simulador 5 (ca6664d1-9c61-4c59-b0db-21d40871f374, b081be5, Expo 58.0.21 / React Native 0.88.1) conserva once manifiestos xcprivacy: tracking false, cero declaraciones de tipos recopilados y dieciséis declaraciones de motivos de acceso a API. Son propiedades de esos manifiestos inspeccionados, no una declaración de ausencia de datos enviados por la aplicación. No incluye claves de uso de cámara/fototeca; medidas/fotos siguen en web. El binario de dispositivo, su ejecución y los formularios reales permanecen pendientes. Ver docs/native-distribution.md.

## Matriz de declaraciones preparada · 30 de octubre

[privacy-form-draft.json](privacy-form-draft.json) convierte el inventario en seis conjuntos contrastados con archivos concretos: nombre, correo, identidad de cuenta, entrenamiento, texto libre y conversación con el coach. Propone categoría/finalidad, vínculo con usuario y obligatoriedad; distingue propuesta técnica de selección final. Todas las selecciones finales permanecen nulas y canSubmit=false. El borrador no se importa ni envía automáticamente.

Los datos de cuenta y entrenamiento se conservan en el servicio; no corresponde declarar ausencia de recopilación. Las notas y comentarios son aportes voluntarios y siguen vinculados a quien los envía. El correo normalizado también puede quedar representado por su hash en el control de intentos: no se lo considera anónimo. La finalidad de personalización propuesta para fitness procede de las referencias/progresión propias del entrenamiento, no de publicidad. La asignación del coach y los permisos no convierten esos registros en públicos.

La búsqueda del catálogo filtra en memoria; el cliente no envía el texto escrito al endpoint de catálogo. Apariencia y preferencias se guardan localmente. Consultar el detalle por ID sí genera una petición. La observación de conectividad lee únicamente si hay conexión/alcance; no consulta IP o MAC mediante expo-network. Esto no impide que la infraestructura de HTTPS reciba la IP de la conexión. Diagnósticos, interacción, soporte externo y metadatos de proveedores se mantienen sin respuesta definitiva hasta verificar su práctica real.

Medidas/fotos permanecen en web externa mediante Linking.openURL; no se encontró WebView controlada o una carga nativa de fotos. Se debe revisar ese límite con la experiencia final, sin concluir ausencia global de datos de fotos solo por no tener permiso de cámara. Igualmente, el Google usado en Expo Go pertenece a herramientas de desarrollo: la cuenta de Iron Strength usa invitación y acceso por correo/contraseña.

Las propuestas usan las [categorías de Apple](https://developer.apple.com/app-store/app-privacy-details/) y la [guía de Data safety de Google](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en), consultadas el30-oct. Son un mapa de preparación sustentado en el producto, no una declaración legal o un formulario aprobado. Las condiciones de los proveedores deben comprobarse antes de elegir la respuesta sobre compartición; no se deduce de la ausencia de una red social o SDK publicitario.

## Binarios actuales: permisos y manifiestos

[native-privacy-inventory.json](native-privacy-inventory.json) conserva identidad/hashes y la lectura directa de preview6 Android y preview8 iOS. Los siete permisos Android son idénticos al inventario anterior del mismo APK. Además de red/vibración y receptor interno, hay WiFi y biometría heredados de SDK; el código de la app usa SecureStore sin requireAuthentication y no recibe muestras biométricas. No hay permisos de cámara, ubicación, almacenamiento/galería o salud. La primera lista esperada del auditor era demasiado estrecha y rechazó WiFi/biometría; se conservó ese fallo de expectativa y se cotejó el conjunto real con el recibo previo, sin cambiar el APK o su configuración.

El archivo iOS original mantiene once manifiestos: todos indican tracking=false, cero tipos recopilados y dieciséis entradas de acceso a APIs requeridas. Info.plist no permite cargas arbitrarias, sí red local; incluye la descripción FaceID del SDK y no las de cámara/fotos/micrófono/ubicación/HealthKit revisadas. Estas son propiedades verificadas del simulador y no sustituyen el formulario de datos de Iron Strength. El inventario deja explícitos los valores ausentes; no los convierte en declaraciones negativas. Los mapas exactos de los previews, Android1568fuentes e iOS1576, se cotejaron por hash y no contienen rutas de los paquetes dedicados de analítica/publicidad buscados. Ese análisis de JavaScript no prueba ausencia de tráfico de SDK nativos o registros de proveedores.

ITSAppUsesNonExemptEncryption continúa sin declarar. HTTPS, SecureStore y UUID de expo-crypto son evidencia técnica; no acreditan por sí solos una clasificación de exportación para todos los países. Mantener la respuesta pendiente hasta contrastar candidato/regiones y el recorrido oficial de [cumplimiento de cifrado de Apple](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/). No se cambió ese campo ni se recompiló para omitir preguntas de la consola.

Para cerrar T203 faltan candidato de dispositivo y tráfico/SDK finales, práctica de proveedores, revisión de las preguntas de las consolas y aprobación del envío. La matriz no decide audiencia infantil, clasificación por edad, condición de dispositivo médico, países, titular legal o impuestos. No se modifica la política pública por preparar estas propuestas.
