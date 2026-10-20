# Entorno local preparado

Configurado el 2026-10-19 para probar la aplicación completa con Auth, Postgres, REST, Storage, Realtime, Studio y correo local.

## Estado en este equipo

- Aplicación: `http://127.0.0.1:3000`.
- API de Supabase: `http://127.0.0.1:54321`.
- Studio: `http://127.0.0.1:54323`.
- Correo de prueba: `http://127.0.0.1:54324`.
- `.env.local` contiene las claves locales y está excluido de Git, con permisos de lectura/escritura solo para el usuario.
- Preparación inicial con `npm run dev:seed`: coach y dos alumnos. T164 añadió un tercer alumno y copias de programa para las cuentas que no tenían uno; ahora las cuatro cuentas pueden entrenar. Alumno Uno conserva su programa e historial. Los datos de acceso están en `outputs/acceso-local.md`, en la carpeta padre del repositorio; no se incluyen en esta documentación ni en Git.

Docker está instalado, pero el entorno del agente no tiene acceso a su socket. Se usó el [runtime nativo oficial de Supabase](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes), experimental en la CLI 2.120.0 que ya usa el proyecto. Los servicios y la base son reales; no se usa la demo de Vite.

Los archivos de la CLI se guardan bajo `work/supabase-home` en la carpeta padre del repo, mediante `SUPABASE_HOME`. Se activa `SUPABASE_EXPERIMENTAL_STACK=1` y se desactiva Storage vector, que no usa esta app y no está soportado por el runtime. No se inician Analytics, Pooler ni Edge Functions, que tampoco usa el producto. La configuración Docker versionada de `supabase/config.toml` se conserva.

## Volver a iniciar

Desde el repositorio, en una terminal:

```sh
node ../work/supabase-host.mjs
```

Mantener esa terminal abierta. El supervisor mantiene los procesos nativos activos en el entorno del agente, actualiza las claves locales sin mostrarlas y carga la semilla idempotente. Un arranque normal conserva los datos. No usar `--verify` para el uso diario: esa opción reinicia la base y ejecuta pruebas que eliminan los usuarios locales.

En otra terminal:

```sh
npm run dev -- --hostname 127.0.0.1 --port 3000
```

El supervisor y los archivos de acceso son archivos locales de este equipo, fuera del repo; no son parte del despliegue ni se suben a GitHub.

## Validación realizada

- Reset local con todas las migraciones y el catálogo de ejercicios.
- 272 comprobaciones SQL/pgTAP en 17 archivos: pasan, incluidos permisos RLS y el contador atómico de login.
- 204 pruebas de integración en 25 archivos: pasan.
- `npm run check`: 350 pruebas en 35 archivos, formato, lint, tipos y build de producción: pasan.
- Navegador real: login del alumno, carga del programa e historial, descanso de dos minutos, volumen en vivo, desmarcado al editar repeticiones inválidas y guardado final. Una lectura independiente confirmó la fila y su serie en Postgres mediante REST.
- Login del coach: muestra sus dos alumnos y el cumplimiento actualizado del entrenamiento guardado.
- Esa validación inicial fue manual mediante el navegador integrado. En T139 se ejecutó además la suite automatizada completa contra otra pila local: **35 E2E pasan**, incluido el editor del coach, accesibilidad en ambos temas y las comprobaciones de guardado/permisos. El check final pasa con 373 pruebas.

Antes de correr comandos de la CLI contra esta pila nativa, usar el mismo `SUPABASE_HOME` y activar `SUPABASE_EXPERIMENTAL_STACK=1` y `SUPABASE_STORAGE_VECTOR_ENABLED=false`. Las pruebas de integración borran usuarios y pgTAP exige una base sin perfiles: ejecutar ambas exclusivamente en la pila aislada descrita abajo. No resetear ni volver a sembrar la base interactiva para validar cambios.

## Ejecutar E2E sin borrar el desarrollo interactivo

El esquema admite un único coach. Playwright usa otra instancia Supabase con las mismas migraciones y el mismo catálogo: no debe apuntar a la base de la app que se prueba manualmente. Crear una pila/proyecto local distinto (por ejemplo `iron-strength-e2e`, con puertos 55321–55324) y aplicar allí migraciones y seed. Nunca hacer reset del proyecto `iron-strength-v2` para este propósito.

Guardar las claves de esa instancia en `.env.e2e.local`, excluido de Git:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<clave pública de la pila E2E>
SUPABASE_SECRET_KEY=<clave privada de la pila E2E>
```

La configuración de Playwright carga ese archivo primero y completa valores ausentes con `.env.local`; las variables de CI ya definidas tienen prioridad. `E2E_ENV_FILE` permite elegir otra ruta privada. La app de pruebas se compila y arranca en el puerto 3100 con estas variables; no reutiliza un servidor de otra ejecución.

La suite usa `coach@iron-strength.e2e.test` y alumnos del mismo dominio reservado. Se puede configurar `E2E_TEST_COACH_EMAIL` dentro de ese dominio y `E2E_TEST_COACH_PASSWORD`; por defecto la contraseña toma `E2E_COACH_PASSWORD` o el valor de prueba documentado. Su limpieza nunca selecciona las cuentas de `dev:seed`, y la semilla se detiene si encuentra otro coach en la base objetivo. Las pruebas de borrado de cuenta solo usan fixtures de la instancia E2E.

```sh
npm run test:e2e
```

En este equipo, el supervisor nativo aislado se puede iniciar desde el repo con `node ../work/t139-e2e-stack.mjs`. Este supervisor reinicia **solo la base E2E** al arrancar; no usarlo para guardar trabajo manual. Los navegadores de Playwright están en `../work/playwright-browsers`; para usarlos sin escribir en la carpeta personal:

```sh
PLAYWRIGHT_BROWSERS_PATH=../work/playwright-browsers npm run test:e2e
```

## Preparar y probar la apertura sin conexión

`npm run build` prepara los recursos públicos de la pantalla local. La descarga explícita de Mi semana instala esa versión y solo confirma disponibilidad cuando la interfaz y el paquete de datos están completos. `/offline` no consulta la sesión en el servidor ni contiene datos privados en su HTML. El navegador carga únicamente los datos de la cuenta habilitada en el dispositivo.

El servidor de desarrollo no instala el service worker. Para una vista previa local con la base interactiva de `.env.local`, después de detener el servidor que ocupa 3000:

```sh
NEXT_DIST_DIR=.next-interactive npm run build
NEXT_DIST_DIR=.next-interactive npm run start -- -p 3000
```

E2E conserva `.next` y el puerto 3100. Los workers se generan con una URL por versión y entorno, de modo que una compilación de pruebas no reemplaza el worker de la vista previa interactiva. Sus archivos generados se excluyen de Git. Las páginas autenticadas, RSC, APIs y fotos privadas no se guardan en Cache Storage.

Prueba: entrar con conexión, descargar, esperar «Disponible sin conexión», cerrar la pestaña, desactivar la red y abrir la app. Una sesión empezada puede recuperarse después de vencer la semana; una sesión nueva solo puede iniciarse dentro de la semana descargada vigente. El historial descargado conserva diez resultados por ejercicio; más resultados y el detalle completo requieren conexión.

## Cuatro cuentas y dos motores de navegador

La preparación manual adicional se ejecuta con `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env.local scripts/prepare-four-local-accounts.ts`. Es aditiva e idempotente: conserva programas vigentes/futuros y registros existentes, añade alumnos hasta tres y permite entrenar al coach. Requiere una plantilla y el acceso local del coach; no se admite una base remota.

Playwright ejecuta Chromium y WebKit en serie contra la instancia aislada. En una máquina con permisos de instalación: `npx playwright install --with-deps chromium webkit`. Para un solo motor: `npm run test:e2e -- --project=webkit`. El gesto táctil continuo por CDP se limita a Chromium; la [guía para teléfonos](phone-validation.md) identifica la comprobación física de Safari pendiente.

En este equipo Ubuntu 26.04, las bibliotecas que faltaban para WebKit se descargaron como paquetes del sistema y se extrajeron bajo `../work/webkit-deps/root`, sin instalar paquetes globales. Sus bibliotecas compartidas están enlazadas en `minibrowser-wpe/sys/lib` y `minibrowser-gtk/sys/lib` del navegador de pruebas. No se cambiaron binarios del navegador ni archivos del sistema. Si se reinstala el navegador, repetir esa preparación o instalar sus dependencias normalmente. Estos archivos locales no forman parte del despliegue.
