# Avisos de dependencias y módulos de la app

Control de T202 sobre JavaScript exportado por Hermes. No sustituye la auditoría del árbol instalado, la revisión de herramientas, bibliotecas nativas, firma, pruebas físicas o revisión de tienda.

## Ejecución

Guardar `npm audit --prefix mobile --json` en un archivo privado fuera de Git. npm devuelve salida 1 cuando encuentra avisos; conservar el informe en vez de aplicar audit fix. Si falta el informe o contiene un error de acceso/red, el control no lo acredita.

Desde mobile, exportar con `CI=1 npx expo export --platform android --platform ios --source-maps external --max-workers 2 --output-dir DIRECTORIO_PRIVADO`. Se contrastó la ayuda instalada de SDK 58 y la [documentación de Expo CLI](https://docs.expo.dev/more/expo-cli/). Los mapas incluyen fuentes: mantenerlos privados, fuera de Git y de la ficha pública de tiendas.

Desde la raíz ejecutar `npm run ops:native-audit -- INFORME_NPM_JSON DIRECTORIO_EXPORTACION`. Solo lee archivos; no instala, actualiza, envía información, cambia un servidor o altera los binarios. El directorio debe contener metadata.json de Metro y ambos bundles Hermes con mapas externos. Registra SHA-256 del informe, metadata, bundles, mapas y lock móvil, sin emitir fuentes. Salida 0 significa que las ubicaciones afectadas conocidas del informe no aparecen en los mapas proporcionados; no significa auditoría integral aprobada. Salida 1 indica un módulo afectado o entrada inválida; 2, uso incorrecto.

El control distingue avisos propios de una biblioteca de los heredados por sus contenedores. Compara rutas completas de node_modules para separar versiones anidadas. Conserva los contadores y todos los avisos propios, aunque estén ausentes de estos mapas. Si aparece cualquier biblioteca afectada en Android o iOS, bloquea el resultado. No hay una lista de paquetes exentos. Los mapas vacíos, sin módulos base del proyecto, de versión desconocida o ambiguos se rechazan; el identificador virtual exacto external-require emitido por Metro se reconoce como tal.

## Resultado del 25 de octubre de 2026

| Árbol instalado  | Ubicación y estado                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| node-forge 1.4.0 | Dependencia de firma de CLI; aviso propio alto, sin versión corregida publicada en el aviso/registro consultados.                                        |
| Zod 3.25.76      | Copia dentro de expo/node_modules; aviso propio alto. La app usa Zod 4.6.6 y la raíz web 4.6.7.                                                          |
| uuid 3.4.0       | Dependencia de ngrok; aviso propio moderado. ngrok usa v4 sin buffer externo; el aviso describe v3/v5/v6 con buffer. Esto no elimina el aviso instalado. |

npm mantiene **siete paquetes con avisos: cinco altos y dos moderados**. Tres tienen avisos propios y cuatro los heredan. La propuesta automática retrocede Expo a 54.0.38; no es compatible con el SDK 58 del teléfono. No se aplicaron overrides, cambios mayores o parches criptográficos propios. Expo 58.0.19, CLI 58.1.15 y node-forge 1.4.0 eran las últimas versiones estables consultadas de esas líneas; los avisos de herramientas continúan abiertos.

La exportación actual contiene **1454 fuentes Android y 1462 iOS**. El cargador metro-require de CLI aparece normalmente; las ubicaciones afectadas de node-forge, uuid y Zod 3 no aparecen en ninguno de esos mapas. Resultado del control: válido para esos mapas, sin declarar limpio el árbol instalado. Las regresiones incorporan módulos afectados, distinguen copias anidadas y rechazan entradas malformadas.

Referencias primarias consultadas: [problema abierto de node-forge](https://github.com/digitalbazaar/forge/issues/1149), [aviso node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv), [aviso Zod y parche 4.6.6](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [aviso uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq) y registro npm de las versiones instaladas. No confundir ausencia en un mapa con un parche de la biblioteca.

## Vincular el control a una versión distribuida

Los nombres de salida de la exportación coinciden con los registrados antes, pero sus bytes Hermes **no son idénticos** a los extraídos del APK preview code 4 y la app iOS de simulador. La comparación se conserva como resultado negativo. No se atribuye una causa sin comprobarla ni se extrapola este análisis a esos archivos. La salida incluye artifactIdentityVerified=false.

Para acreditar un candidato de tiendas, conservar mapas generados junto al mismo build, extraer su bundle y comparar sus bytes/hashes con el archivo analizado. Guardar además commit, perfil, configuración, versión y firma. Si no coinciden, obtener evidencia del build correcto antes de concluir sobre ese binario. No modificar el APK para hacerlo coincidir, reconstruir silenciosamente un candidato o tratar una nueva exportación como si fuera el artefacto firmado probado. El control actual acredita únicamente sus mapas y conserva por separado los riesgos de las herramientas.

## Evidencia recuperada del build Android de pruebas

El 25-oct-2026 se localizaron el mapa compuesto de Hermes y el bundle que Gradle generó para el APK quality escalado de T202. El archivo guardado iron-strength-quality-t202-scaled.apk y outputs/apk/release/app-release.apk tienen SHA-256 **2ac5bdcccb6ad47e280d01dd4a9716323849080fd6b60c6ec14fca9dcd3d686e**. La entrada assets/index.android.bundle del APK es idéntica, byte por byte, al bundle de generated/assets/react/release: SHA-256 **f68a37550a5ba37e9e1344357aa833bbb34a58335955d46eac4f649a669fa5f8**. El mapa compuesto conservado de esa salida Gradle tiene SHA-256 **093c98a91a4163121d378417cef27a40e465c7959727232a6d0d960c92f9f5d0**, versión 3 y **1548 fuentes**. El lock de ese árbol y el móvil actual coinciden.

El mismo analizador contrastó ese mapa Android y, por separado, el mapa iOS de la exportación previa (1462 fuentes), sin módulos afectados de node-forge, uuid o Zod 3 anidado. El origen de cada entrada y sus hashes se conservaron en product-local-native-map-audit-proof.json, privado fuera de Git. Para Android quality se acredita la identidad del bundle del APK con la salida de su build; el mapa se conserva junto a esa salida, sin prometer un vínculo criptográfico intrínseco entre mapa y bundle. Para iOS sigue siendo solo una exportación sin identidad de binario verificada.

Este APK de pruebas precede a los enlaces de ayuda de T203. No se extrapola al APK preview 4, al simulador iOS o a un futuro candidato de tienda, ni elimina avisos de herramientas o cubre bibliotecas nativas. No se reconstruyó o modificó ningún APK, cargaron mapas a terceros o consumieron builds EAS. El resultado permite conservar una evidencia real del circuito Android ya probado, además de la exportación genérica anterior.

## Captura iOS de la misma compilación (T202)

El plugin CNG `mobile/plugins/with-ios-build-evidence.cjs` prepara la fase de empaquetado existente de Xcode, sin editar el proyecto generado. Solo con `IRON_CAPTURE_IOS_BUILD_EVIDENCE=1` y una configuración distinta de Debug habilita el mapa compuesto de Hermes. Los perfiles iOS preview/production declaran tres artefactos adicionales cerrados: `.build-evidence/ios.map`, `ios.hbc` e `ios-proof.json`. No se activa Observe ni la subida automática de mapas; los archivos quedan fuera del archivo de aplicación, Git y futuras subidas de fuente.

La fase exige un destino nuevo, rechaza enlaces simbólicos y conserva el fallo del empaquetado. Después, el capturador valida mapa, cabecera Hermes, producto y trabajo; copia y relee los bytes del bundle de Xcode y escribe hashes e identidad sin volcar variables del entorno. El validador de dependencias existente sigue siendo necesario: este recibo vincula archivos, no declara segura una dependencia ni acredita una ejecución iOS.

Después de descargar la aplicación y los artefactos adicionales del mismo ID EAS, comparar el bundle extraído con `ios.hbc` y su recibo antes de auditar el mapa. Si falta el mapa, el ID, la fuente o la igualdad de bytes, conservar el diagnóstico sin acreditar ese binario. Los previews anteriores y cualquier exportación separada conservan sus límites. El nuevo simulador usa build iOS 6; el APK Android preview5 sigue siendo su referencia anterior verificada. Firma iPhone, ejecución, aceptación física y candidato de tienda siguen pendientes.
