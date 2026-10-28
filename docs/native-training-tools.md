# Herramientas y ejercicios propios · T216–T217

Implementación local del cliente Expo. No implica publicación en la web, entrega por Expo Go ni aceptación en un teléfono físico.

## Mis ejercicios

Abre **Entrenar → Biblioteca de ejercicios → Mis ejercicios**, o el acceso **Mis ejercicios** de Cuenta. Puedes buscar, crear y editar tus ejercicios. El tipo de registro se elige al crear; para usar otro tipo, crea otro ejercicio. Los ajustes de carga aparecen cuando corresponden al tipo. Los ejercicios propios pertenecen solo a tu cuenta; el coach conserva el acceso a los entrenamientos que puede revisar.

**Guardar ejercicio** confirma el servidor. **Guardado en este dispositivo** protege únicamente el borrador: puedes volver a la lista y retomarlo después de recargar. Si falla el espacio local, conserva el texto y usa el reintento local antes de enviar. Una respuesta perdida ofrece reintentar el mismo intento; no crees el ejercicio de nuevo para recuperarlo.

Un conflicto ofrece **Revisar versión actual del ejercicio**. Compara los datos y elige **Conservar mi edición** antes de guardar sobre la nueva revisión. Si se eliminó, **Conservar como ejercicio nuevo** prepara una copia independiente. Un conflicto de archivo requiere revisar y elegir otra vez la acción; no reutiliza la confirmación anterior.

En **Opciones**, archivar pide confirmación y conserva tus rutinas e historial; la pestaña **Archivados** permite restaurar. **Exportar mis ejercicios** prepara tus metadatos activos y archivados como JSON: descarga en web y hoja de compartir en Android/iPhone. No incluye credenciales ni recibos internos. Cuenta muestra los cambios pendientes y exige guardarlos o descartarlos antes de salir. Borrar la cuenta por el recorrido confirmado elimina también estos datos de esa cuenta en el dispositivo, conservando las otras cuentas.

## Discos por lado

En el registro, abre **Herramientas del ejercicio → Calculadora de discos**. Indica la carga total, incluida la barra, la unidad del equipo y los tamaños y pares disponibles. Un par corresponde a un disco a cada lado. La calculadora busca una combinación simétrica exacta con la menor cantidad de discos; si hay empate, prefiere tamaños mayores.

Sin una combinación exacta, muestra la causa. No aproxima la carga ni supone discos que no declaraste. **Calcular discos** es una consulta y no cambia tu serie. **Guardar equipo en este dispositivo** conserva el inventario solo para tu cuenta. Cerrar sin guardarlo descarta esa edición del equipo.

## Calentamientos

Abre **Preparar calentamientos**, completa las métricas del ejercicio y, si necesitas, añade más filas (hasta cinco). No hay cargas, repeticiones, máximos ni porcentajes recomendados. **Revisar calentamientos** permite consultar los valores antes de **Añadir calentamientos**. Cancelar no agrega series. Cambiar a otra alternativa o reemplazar el ejercicio descarta la preparación no confirmada, para usar las métricas del ejercicio nuevo.

La confirmación agrega las filas pendientes antes de las existentes. Conserva las series ya completadas, sus valores, notas, objetivos de trabajo, agrupaciones y el descanso que está corriendo. Una serie de calentamiento no avanza la ronda ni suma volumen de trabajo. Máximo veinte series por ejercicio y trescientas en el entrenamiento; la operación se rechaza completa si no caben todas.

Si falta espacio, los calentamientos quedan en memoria con un aviso de guardado sin confirmar. Usa **Reintentar guardado de calentamientos** o el reintento general del registro cuando haya espacio. No prepares otro lote para recuperar el anterior: la propuesta conserva sus identificadores y el reintento no la duplica. No cierres el navegador mientras siga sin confirmarse el guardado local. Un cambio desde otra ventana exige revisar el conflicto; no sobrescribe su registro.

## Descanso y columnas

**Ajustar descanso del ejercicio** muestra una revisión antes de confirmar. Para una superserie, cambia el descanso de todo el grupo. Se aplica al próximo descanso; no reinicia ni prolonga el temporizador actual. Puedes usar tu descanso habitual o ingresar otro valor de cero a seiscientos segundos, en pasos de quince. Cero significa sin descanso. Los calentamientos conservan el descanso breve de 60 s existente; una elección de cero también lo desactiva.

En **Cuenta → Preferencias de entrenamiento**, configura el descanso habitual, la visibilidad de objetivos y de la referencia anterior. Guarda o cancela explícitamente. El descanso habitual solo completa valores ausentes al iniciar una sesión nueva; una prescripción explícita (incluido cero) tiene prioridad. Las sesiones en curso y las repetidas desde un resultado conservan sus descansos. Las columnas no ocultan los campos necesarios para registrar una serie.

## Unidades

Puedes elegir kg/lb y m/km/mi para la presentación de objetivos, equivalencias del registro y resultados. Los campos de registro y edición permanecen identificados en kg y metros. Al usar otra unidad, la equivalencia aparece junto al campo. Cambiar la preferencia no convierte el texto guardado, ni modifica métricas, prescripciones, resultados históricos o cierres pendientes. Los gráficos y otros consumidores anteriores mantienen sus unidades canónicas explícitas hasta su evolución prevista en T218; esta entrega no recalcula esos datos.

La conversión usa 1 lb = 0,45359237 kg y 1 mi = 1609,344 m; el redondeo a dos decimales afecta solo al texto mostrado. El equipo de discos declara su propia unidad: al cambiarla, revisa los números del equipo; no se convierten automáticamente.

## Recuperación y límites

Las preferencias y el equipo se guardan por cuenta, con comprobación de escritura y relectura. Salir de la cuenta los conserva; borrar la cuenta mediante el recorrido confirmado también retira su copia local y conserva las demás cuentas. El borrado de cuenta espera a que termine una escritura de preferencias y reserva las escrituras durante su recorrido, para no reponer datos locales después de limpiar. Un formato desconocido se mantiene intacto y bloquea su edición; puedes recuperar el entrenamiento existente. Los errores de lectura o conflicto permiten releer; **Releer y descartar propuesta** descarta únicamente la edición de preferencias abierta.

Las herramientas no requieren una petición nueva al servidor y funcionan dentro de un registro ya recuperado. Esto no amplía la descarga del catálogo o de rutinas personales, que sigue en T220. Las pruebas de Expo web y la exportación Hermes no acreditan SQLite en un teléfono, apertura sin Metro ni un binario firmado.

## Prueba rápida en una demo

Usa **Entrenar → Ver demo A → Probar entrenamiento demo** para comprobar controles sin enviar un resultado al coach. Estos números son ficticios para verificar la interfaz.

1. Abre Herramientas y calcula 100 kg con barra de 20 kg y dos pares de 20 kg. Debe mostrar dos discos de 20 kg por lado. Pide 101 kg con ese mismo inventario: debe explicar que no puede componerse.
2. Prepara un calentamiento de 20 kg y 5 repeticiones. Revisa y cancela: el registro debe seguir idéntico. Repítelo y confirma: aparece pendiente antes del trabajo, sin completar ni cambiar las series existentes.
3. Con un descanso en curso, revisa y confirma 120 s para el ejercicio. El contador actual debe conservar su hora de término; el próximo descanso de trabajo utiliza la elección correspondiente al ejercicio/grupo.
4. En Cuenta, elige lb y guarda preferencias. Al retomar, los campos siguen en kg y muestran su equivalencia; no cambian las cifras guardadas. Recarga y vuelve a entrar con la misma cuenta para recuperar el registro.
5. En preferencias, cambia un valor y cancela. Vuelve a abrirlas: deben conservar la última configuración confirmada.

Registra por separado dispositivo, sistema, versión del cliente y resultado observado. Esta lista no acredita que esa prueba física ya se haya realizado.
