# Preparar e instalar las versiones móviles

La configuración local prepara desarrollo, preview y producción conservando el proyecto EAS del propietario. T201 generó un APK Android preview code 2, firmado y sin los permisos heredados. T202 encontró un cierre al confirmar comentarios por un rol de accesibilidad no admitido; no distribuir ese binario anterior. El reemplazo code 3 está en preparación. El code 1 se conserva únicamente como diagnóstico. Todavía no hay IPA ni una versión enviada a tiendas. Las cuentas, firma, dispositivos y cuotas se verifican antes de construir en T201.

## Variantes

| Perfil            | Instalación                                            | Identificador propuesto            | Servidor de desarrollo              |
| ----------------- | ------------------------------------------------------ | ---------------------------------- | ----------------------------------- |
| development       | Herramientas de desarrollo, Android/iPhone autorizados | com.domarchis.ironstrength.dev     | Sí, expo-dev-client.                |
| preview           | APK Android y ad hoc iOS, con bundle incluido          | com.domarchis.ironstrength.preview | No.                                 |
| preview-simulator | Simulador iOS, hereda preview                          | com.domarchis.ironstrength.preview | No; no se instala en iPhone físico. |
| production        | AAB Google Play / iOS para App Store o TestFlight      | com.domarchis.ironstrength         | No.                                 |

Son propuestas locales: verificar disponibilidad y titular antes de registrarlas. app.config.js resuelve nombres y esquemas distintos; una variante desconocida produce error. APP_VARIANT omitida conserva Iron Strength y iron-strength para Expo Go. El owner domarchis y projectId 1374e5c4-2620-4034-b8b7-e32e479ff9c8 no cambian. No se crearon otros proyectos.

Los perfiles apuntan expresamente a la API HTTPS actual. Preview separa instalaciones, no datos del servidor: iniciar sesión con una cuenta real lee/escribe sus propios registros. Nunca ejecutar seeds o pruebas destructivas contra esa API. El entorno de pruebas continúa siendo la pila aislada local. Las instalaciones distintas no comparten automáticamente credenciales o borradores; no desinstalar una versión con pendientes sin resolverlos.

## Verificación antes de construir

1. Desde mobile, comprobar la cuenta autorizada con `npx eas-cli@latest whoami` y el proyecto con `npx eas-cli@latest project:info`.
2. Confirmar identificadores, membresía/equipo Apple y permisos de Play Console del propietario. Revisar cuotas de compilación; no contratar capacidad ni aceptar gastos automáticamente.
3. Inspeccionar configuración con `APP_VARIANT=preview npx expo config --type public`. No imprimir o compartir variables privadas; las EXPO_PUBLIC forman parte del cliente.
4. Verificar archivo que se subirá: incluir reglas compartidas de src y excluir entornos privados, respaldos, credenciales, registros de prueba y artefactos locales. Los comandos EAS se ejecutan desde mobile, según la guía oficial de monorepos.
5. Comprobar versiones locales de app/build, iconos, permisos y dependencias antes de compilar. No se configuró envío automático ni actualizaciones OTA.
6. Para iPhone con distribución ad hoc, comprobar dispositivo registrado y perfil que lo incluya antes de compilar. Los requisitos exactos se confirman con la cuenta del propietario; registrar un dispositivo no equivale a tenerlo provisionado en Apple.

Estos pasos son previos a los comandos de T201 y no se ejecutaron como operaciones remotas de firma o compilación durante T191.

## Comandos de la etapa de binarios

Después de las verificaciones, desde mobile:

```bash
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile preview
```

El resultado preview debe probarse con Metro detenido: entrar, consultar, registrar, recuperar, cerrar y comprobar un único resultado real. La apertura sin conexión de una semana descargada solo se acepta después de T197–T199; una app instalable no añade esa función por sí sola.

Para desarrollo local se mantiene `npm run start` en Expo Go. `npm run dev-client` requiere tener instalado el binario development y usa APP_VARIANT=development (shell POSIX). El cliente de desarrollo no es el instalador preview independiente. Ningún comando de esta guía declara una publicación en tiendas.

## Firma y mantenimiento

Conservar claves de firma en el sistema de credenciales autorizado, nunca Git/chat. Registrar responsable, recuperación y acceso a las cuentas antes del lanzamiento. Versionado local: buildNumber iOS 1 y versionCode Android 3 tras retirar permisos heredados del primer APK: incrementar antes de otra entrega que lo requiera; no se modifican contadores remotos automáticamente. Una nueva dependencia nativa requiere recompilar; los cambios compatibles del JavaScript siguen el procedimiento de actualizaciones que se defina y pruebe en la etapa de operación.

La aceptación del diseño se realiza con el prototipo de spec 009; la aceptación del producto exige binarios y teléfonos reales. Los requisitos de privacidad, soporte, borrado y pruebas de tienda se validan antes de enviar el artefacto final.

Referencias oficiales: [perfiles](https://docs.expo.dev/build/eas-json/), [variantes](https://docs.expo.dev/build-reference/variants/), [distribución interna](https://docs.expo.dev/build/internal-distribution/), [monorepos](https://docs.expo.dev/build-reference/build-with-monorepos/), [dev-client SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/dev-client/). Consulta del 24 de octubre de 2026.

T201 bloquea en preview/producción los permisos heredados de almacenamiento externo y superposición mediante android.blockedPermissions. Comprobar su ausencia con aapt2 sobre cada APK final, además de verificar certificado y paquete. El primer APK code 1 es diagnóstico; la nueva entrega debe usar code 2 o posterior y el mismo certificado para conservar datos al actualizar. No desinstalar para aplicar una actualización con borradores pendientes.

## Android preview anterior

[Estado del build anterior en Expo](https://expo.dev/accounts/domarchis/projects/iron-strength-mobile/builds/7372df00-928f-4dc6-a714-4760fd192147): versión 0.1.0/code 2, paquete com.domarchis.ironstrength.preview, compilación de 5077116. Firma y manifiesto comprobados; actualizado en emulador Android 16 y abierto en frío en modo avión. Es un APK Android, no una instalación para iPhone ni un envío a Google Play. No usar este instalador para una nueva beta: el cierre de confirmación se corrigió en el código T202 y el reemplazo code 3 debe verificarse antes de distribuir. El cliente usa la API real al entrar con tu cuenta. La prueba completa del registro/offline y los teléfonos reales se documentan por separado. iPhone necesita la membresía/perfil de dispositivo del propietario antes de construir.
