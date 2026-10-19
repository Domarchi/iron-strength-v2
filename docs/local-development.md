# Entorno local preparado

Configurado el 2026-10-19 para probar la aplicación completa con Auth, Postgres, REST, Storage, Realtime, Studio y correo local.

## Estado en este equipo

- Aplicación: `http://127.0.0.1:3000`.
- API de Supabase: `http://127.0.0.1:54321`.
- Studio: `http://127.0.0.1:54323`.
- Correo de prueba: `http://127.0.0.1:54324`.
- `.env.local` contiene las claves locales y está excluido de Git, con permisos de lectura/escritura solo para el usuario.
- Usuarios creados por `npm run dev:seed`: coach y dos alumnos. Alumno Uno tiene programa de tres semanas e historial. Los datos de acceso están en `outputs/acceso-local.md`, en la carpeta padre del repositorio; no se incluyen en esta documentación ni en Git.

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
- La suite automatizada de Playwright no se ejecutó en esta configuración; lo anterior es una comprobación manual mediante el navegador integrado.

Antes de correr comandos de la CLI contra esta pila nativa, usar el mismo `SUPABASE_HOME` y activar `SUPABASE_EXPERIMENTAL_STACK=1` y `SUPABASE_STORAGE_VECTOR_ENABLED=false`. Las pruebas de integración/E2E borran los usuarios locales y pgTAP exige una base sin perfiles: después de las pruebas, restaurar los datos de prueba con `npm run dev:seed`, como indica `AGENTS.md`.
