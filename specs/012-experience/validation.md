# Validación · Spec 012

## T238 · 12-nov-2026

- Rama `codex/redesign-forja-20261112` desde d487362. El `node_modules` heredado estaba desfasado (react-native 0.88.0 frente a 0.88.1 del lock); se reinstaló con `npm ci` y quedó solo el desfase de safe-area-context y screens, corregido junto con las nuevas.
- `npx expo install` añadió: react-native-reanimated 4.7.1, react-native-worklets 0.13.0, react-native-gesture-handler ~3.3.0, expo-haptics ~58.0.8, expo-keep-awake ~58.0.4, @gorhom/bottom-sheet ^5.2.14, @shopify/flash-list 2.3.2, @expo-google-fonts/barlow-condensed ^0.4.1 e inter ^0.4.2; react-native-safe-area-context ~5.11.1 y react-native-screens ~4.30.1. Sin babel.config: babel-preset-expo carga el plugin de worklets.
- Único cambio de código: `GestureHandlerRootView` en `mobile/src/app/_layout.tsx`.
- Resultados: `npm run check` móvil con 56 archivos y 491 pruebas aprobadas; `expo export` Android e iOS (Hermes, 6,4 MB cada uno) con un archivo temporal que importaba los ocho módulos nuevos (retirado después); 60 E2E aprobadas en Chromium y WebKit (visual-foundations, workout-refresh, home-refresh, fluidity).
- Límites: no se ejecutó en teléfono; no se probó si Expo Go SDK 58 trae todos los módulos nativos (si no, se necesita build de desarrollo); no se corrió la regresión E2E completa de 566 casos; las fuentes aún no se cargan (T239); sin commit.

## T239 · 12-nov-2026

- Código: `mobile/src/ui/` (tokens, theme, fonts, text, actions, display, controls, feedback, overlay, appbar, index), galería `mobile/src/app/design.tsx` (redirige a `/` fuera de desarrollo) y `useForjaFonts()` en el layout raíz. El tema sigue la preferencia vigente (Claro/Oscuro/Sistema) mediante `usePalette`.
- Corrección al diseño aprobado: en claro el acento #E8480F da 3,9:1 con texto blanco; se usa #C73A08 (5,2:1) y un fondo suave `accentSoft` (#FFF1EA) para etiquetas, que la galería detectó con 4,2:1 antes de ajustarse.
- Defectos encontrados y corregidos por las pruebas: chips de 34 px (ahora 44 px de objetivo), interruptor nativo de 40×20 (ahora fila de 56 px con interruptor propio), roles ARIA de radio, interruptor, ajuste y anillo no llegaban a la web con `accessibilityRole`, ActivityIndicator sin nombre.
- Resultados: 31 pruebas de tokens (contraste de 13 pares en ambos temas); check móvil completo con 57 archivos y 522 pruebas; 12 E2E de la galería (Chromium y WebKit: AA, 360 px, objetivos de 44 px, hoja/diálogo/menú con Escape, segmentado/ajuste/aviso); regresión enfocada de 64 E2E (acceso, cuenta, Inicio, registro, fundamentos y galería) sin fallos; exportación Hermes Android e iOS.
- Límites: sin probar en teléfono (arrastre de la hoja, háptica, fuentes en nativo); el arrastre para cerrar usa gesture-handler y solo está verificado en web con teclado; la galería está empaquetada en producción pero redirige; las pantallas actuales siguen con la paleta anterior; falta la regresión completa de 566 casos.
