# T237 · Dos direcciones de marca — elegida A · Forja (12-nov-2026)

Referencia estática en `docs/design-refresh/brand/` (index.html, brand.css, brand.js; fuentes locales; capturas en `captures/`, script `capture.mjs`, servidor estático en el puerto 8110). Datos ficticios, sin red ni almacenamiento (CSP cerrada). **No es la app**: no acredita fluidez ni funciona como pantalla nativa.

Cuatro pantallas por propuesta (Hoy, Registro, Resultado, Progreso) en oscuro y claro, más una hoja de componentes con los cuatro roles de acción (primario, secundario, terciario, peligro). Atiende hallazgos de T236: H1 (descartar fuera de la vista), H2 (sugerido ≠ digitado), H3 (cabecera más corta), H6 (esfuerzo como selector), H7 (sin tarjeta de descarga repetida en Hoy), M11 (gráfico con ejes, valores y marca del punto) y el patrón de acciones sin forma.

|            | A · Forja                                                               | B · Claridad                                                   |
| ---------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| Carácter   | Atlética, técnica, directa                                              | Sobria, premium, calmada                                       |
| Tipografía | Barlow Condensed (títulos y cifras, mayúsculas) + Inter                 | Manrope en todo                                                |
| Acento     | Naranja #FF5A1F / #E8480F                                               | Cobalto #5B86FF / #2457E6                                      |
| Récord     | Ámbar                                                                   | Lima #C4F24F                                                   |
| Forma      | Radios 8–12 px                                                          | Radios 14–20 px, píldoras                                      |
| Riesgo     | Naranja muy visto en fitness; condensada cansa si se usa en texto largo | Parece la app actual; lima exige cuidado de contraste en claro |

Decisiones por tomar: D1 (tipografía) y D2 (color). Se puede combinar (por ejemplo tipografía de A con color de B). Tras la elección se ajusta la propuesta ganadora y se pasa a T238/T239.

## Decisión

El propietario eligió **A · Forja** sin combinaciones. Tokens de partida en `docs/design-refresh/brand/brand.css` (bloque `.phone[data-p="a"]`). El sistema v2 (T239) los traduce a tokens nativos y verifica contraste AA; el naranja claro #E8480F sobre blanco y el texto oscuro sobre #FF5A1F se comprueban ahí.
