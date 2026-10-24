# Validación de calidad de producto

## T189

Alcance, inventario por plataforma y recorridos contrastados con las rutas, contratos y spec 008 sobre d18526a. Check raíz aprobado el 24 de octubre de 2026: formato, lint sin errores (diez avisos existentes), tipos, 519 unitarias y build Next 16.4.3 con 64 recursos. Evidencia privada product-t189-check.log. Sin cambios de código, base o producción; no se añadieron tests que dupliquen documentación. El plan distingue funciones disponibles, pendientes y requisitos de firma/aceptación física.

## T190

Prototipo autónomo en mobile/public/design-review/index.html, sin API, autenticación, recursos externos o persistencia. Cuatro vistas y dos temas; cambios de serie, búsqueda y revisión de asignación simuladas. Marca DEMO visible en capturas. La aceptación visual del propietario permanece pendiente y T194 no se declara implementada.

Prueba previa en rojo por ausencia de referencia. Primer recorrido detectó colisión de una variable global del navegador; se corrigió y añadió captura de errores de ejecución. Axe detectó que la barra de avance carecía de rol: ahora expone progressbar y valores. No se desactivaron reglas.

Check raíz aprobado (519 unitarias, formato, tipos, lint sin errores con diez avisos previos y build); check móvil con 27 pruebas y un aviso previo de hooks. Ocho E2E Chromium/WebKit aprobadas sin reintentos en 41 s: ocho combinaciones visuales por motor con Axe A/AA/2.1AA, sin desbordamiento, navegación/serie/diálogo y ausencia de peticiones de escritura o almacenamiento. Revisión adicional a 360 px, objetivos táctiles y retorno del foco al cerrar con Escape. Editor de escritorio compactado después de revisar capturas; ocho E2E finales repetidas sobre ese ajuste.

Capturas finales inspeccionadas y conservadas fuera de Git en work/product-design. Prototipo remoto abierto en navegador de Codex y disponible temporalmente mediante el túnel Expo existente: https://vjnvtvu-domarchi-8081.exp.direct/design-review/index.html. Esto publica solo la referencia con datos ficticios en el servidor de desarrollo, sin desplegar la app o modificar producción. Evidencia privada product-t190-before.log, product-t190-ui-final.log, product-t190-root-check.log y product-t190-mobile-check.log. Sin base/migraciones: no se ejecutaron integración ni pgTAP.
