# Recursos Azul atleta — T174

Se conserva el arte original aprobado. Son conversiones de formato y tamaño, sin regeneración de la ilustración. Los dos PNG originales siguen disponibles en la lista pública para clientes anteriores.

Conversión con Sharp 0.35.5 ya instalado: `resize({ width, withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 100, effort: 6 })`.

| Recurso               |     Bytes |
| --------------------- | --------: |
| hero-v1.png original  | 2.052.646 |
| squat-v1.png original | 1.254.121 |
| hero-768-v1.webp      |    27.840 |
| hero-1536-v1.webp     |    85.562 |
| squat-160-v1.webp     |     8.138 |
| squat-320-v1.webp     |    19.080 |

Referencia conjunta original: 3.306.767 bytes. Teléfono (hero 768 y squat 320): 46.920 bytes, reducción del **98,58 %**, superior al objetivo del 70 %. Las cuatro variantes precacheadas suman 140.620 bytes, reducción del 95,75 % incluso contando ambas resoluciones.

`assets.json` mantiene la lista pública compatible; `offline-assets.json` contiene únicamente las cuatro variantes nuevas. La compilación incluye estas últimas en la lista offline cerrada y verifica su disponibilidad antes de confirmar la descarga. No se cachean páginas autenticadas, APIs, fotos ni credenciales. Una interfaz anterior conserva sus URL originales y su worker inmutable.
