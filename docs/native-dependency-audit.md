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
