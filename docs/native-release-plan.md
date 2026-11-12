# Plan de desarrollo: app nativa en iOS y Android (12-nov-2026)

Auditoría hecha leyendo specs 008–010, docs/store-release, docs/native-distribution.md, eas.json y app.config.js. No se ejecutó nada contra producción ni tiendas.

## 1. Estado real

**Hecho y verificado en software**

- Cliente Expo SDK 58 (Inicio, Entrenar, Historial, Progreso, Cuenta), registro offline con SQLite, cola con sincronización, biblioteca personal, nueve tipos de ejercicio, descarga offline, borrado de cuenta, privacidad/soporte públicos.
- API `/api/mobile/v1` y 56 migraciones publicadas (dominio en T221, BUILD_ID 39dc90df…).
- Previews: Android APK `preview` code 6 y iOS solo simulador build 8. Circuito de cuatro actores en Android y iOS (emulador/simulador).
- Fichas, iconos y capturas QA preparados; borradores de privacidad.

**No existe todavía**

- Ningún AAB ni IPA de producción. Los previews usan `com.domarchis.ironstrength.preview` y no sirven para tiendas.
- Identificadores `com.domarchis.ironstrength` sin registrar (propuestos, no confirmados).
- Cuentas Apple Developer (USD 99/año) y Google Play Console (USD 25 una vez): el propietario no las tenía registradas.
- Ejecución en iPhone y Android físicos (solo emulación).
- Candidato firmado: `candidate.t221.json` tiene todo en null.
- CI verde: se desbloqueó al hacer público el repo; ejecución 43255365395 en curso con el tope E2E subido.

## 2. Hallazgos de la auditoría (riesgos)

| #   | Hallazgo                                                                           | Riesgo                                         | Acción                                                                                     |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A1  | Cuentas de tiendas inexistentes                                                    | Bloquea todo lo demás                          | Fase 0                                                                                     |
| A2  | Google exige 12 testers × 14 días en cuenta personal nueva                         | Retrasa Android ≥ 2 semanas                    | Empezar la prueba cerrada lo antes posible; reclutar testers (coach + 3 alumnos no bastan) |
| A3  | Apple: la revisión exige cuenta de demo y que la app no sea solo un contenedor web | Rechazo                                        | Preparar cuenta de revisor en producción y notas de revisión                               |
| A4  | Alumnos y coach reales: solo hay 1 coach; faltan 3 alumnos                         | Sin beta real                                  | Pedir al propietario nombres y correos, invitar tras su autorización                       |
| A5  | 5 avisos altos en tooling móvil (node-forge, uuid, Zod 3 anidado)                  | Ya mitigado: no están en el bundle según mapas | Reauditar mapas del build de producción                                                    |
| A6  | Medidas y fotos solo en web                                                        | Producto incompleto frente a la web            | Decisión del propietario: se mantiene así en v1                                            |
| A7  | CI: 3 pruebas Expo UI fallaron por espera de 5 s                                   | Posible flake                                  | Ver resultado de la ejecución actual                                                       |
| A8  | Migraciones: remoto en 56 (T221), pendiente confirmar                              | Desfase API/base                               | Verificar con list_migrations antes de construir                                           |
| A9  | Respaldo semanal programado sin primera ejecución confirmada                       | Operación                                      | Confirmar antes del lanzamiento                                                            |
| A10 | Tema/privacidad: cuestionarios de las consolas sin enviar                          | Bloquea revisión                               | Fase 3                                                                                     |

## 3. Plan por fases

### Fase 0 · Cuentas y decisiones (propietario, 1–3 días)

1. Crear Apple Developer Program y Google Play Console (cuenta personal o de organización: decide plazos de verificación y la regla de 12 testers).
2. Confirmar identificador de producción `com.domarchis.ironstrength` y nombre público «Iron Strength» (comprobar disponibilidad en ambas tiendas).
3. Definir contacto público de soporte (ya autorizado: joaquindomarchi@gmail.com).
4. Lista de 3 alumnos (y testers adicionales para Google).

- Salida: cuentas activas, IDs confirmados, `candidate.json` con IDs.

### Fase 1 · Estabilizar el código (Claude, 2–4 días)

1. Cerrar CI verde: resultado de 43255365395, investigar las 3 pruebas Expo si repiten.
2. Terminar PR19 (editor coach T232): actualizar descripción, benchmark aislado, marcar listo.
3. Reauditar `npm audit` móvil y mapas Hermes del build de producción (A5).
4. Subir versión: `version 1.0.0`, `buildNumber` 1, `versionCode` 7+ (nunca reutilizar los de previews del mismo ID; el de producción es otro ID, empieza en 1).
5. Verificar 56/56 migraciones remotas y salud de producción (`npm run ops:check`).

- Salida: `main` con CI verde, listo para construir.

### Fase 2 · Builds de producción firmados (Claude + propietario, 2–3 días)

1. `eas build -p android --profile production` → AAB. Dejar que Play gestione la firma (Play App Signing); registrar clave de subida.
2. `eas build -p ios --profile production` → IPA; EAS gestiona certificados con la cuenta Apple (el propietario autoriza el inicio de sesión).
3. Inspeccionar artefactos: permisos, ID, versión, API apuntando a producción, sin material privado, mapas Hermes, alineación 16 KB.
4. Completar `candidate.json` con hashes, build IDs y commit.

- Salida: AAB e IPA reproducibles y documentados.

### Fase 3 · Fichas y cumplimiento (Claude prepara, propietario envía, 3–5 días)

1. Subir capturas finales (recapturar con el candidato de producción, no quality), iconos, textos es-CL.
2. Cuestionarios: Data Safety (Google), App Privacy y clasificación por edad (Apple), declaración de cuenta/eliminación (URL /delete-account ya pública), permisos.
3. Cuenta de revisor con datos ficticios en producción (canal privado de cada tienda).
4. Verificar enlaces /privacy, /support, /delete-account.

### Fase 4 · Beta cerrada (2–3 semanas por la regla de Google)

1. Android: subir AAB a prueba cerrada, invitar ≥ 12 testers y mantenerlos 14 días continuos. iOS: TestFlight interno, luego externo (revisión beta de Apple).
2. Coach entrena primero con su propia cuenta; luego los 3 alumnos. Registrar dispositivo, OS, versión y fallos en `docs/phone-validation.md`.
3. Criterios de parada: pérdida de borrador, duplicados, acceso ajeno, enlaces rotos.
4. Corregir con builds nuevos (versionCode/buildNumber superiores).

### Fase 5 · Lanzamiento (propietario autoriza, 1–7 días)

1. Seleccionar el mismo build probado en cada consola; enviar a revisión (Apple 1–3 días típico; Google ≈ 1–7).
2. Sin auto-publicación hasta confirmación explícita.
3. Verificar instalación real desde cada tienda y `ops:check` el mismo día.
4. Plan de recuperación: web compatible T221, no revertir migraciones.

### Fase 6 · Posterior

- Medidas y fotos nativas, notificaciones, publicación OTA (EAS Update) con política de compatibilidad, monitoreo de errores (Sentry opcional, requiere aprobación por privacidad).

## 4. Cronograma estimado

| Fase          | Duración | Depende de        |
| ------------- | -------- | ----------------- |
| 0 Cuentas     | 1–3 d    | Propietario       |
| 1 Código      | 2–4 d    | — (arrancable ya) |
| 2 Builds      | 2–3 d    | Fase 0 y 1        |
| 3 Fichas      | 3–5 d    | Fase 2            |
| 4 Beta        | 14–21 d  | Fase 3            |
| 5 Lanzamiento | 1–7 d    | Fase 4            |

Total aproximado: 4–6 semanas, dominado por los 14 días de la prueba cerrada de Google.

## 5. Lo que necesito del propietario (en orden)

1. Crear las dos cuentas de desarrollador (o autorizarme a guiarte paso a paso).
2. Confirmar nombre público e ID de producción.
3. Nombres/correos de los 3 alumnos y de testers extra para Google.
4. Autorizar cada gasto, cada subida a tienda y el merge a `main` (publica en Vercel).

## 6. Fuera de alcance (v1)

Pagos, comunidad, relojes/Strava, IA, medidas/fotos nativas. Aceptación física y publicación no se dan por hechas por pruebas de emulador.
