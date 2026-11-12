# Validación · Spec 012

## T238 · 12-nov-2026

- Rama `codex/redesign-forja-20261112` desde d487362. El `node_modules` heredado estaba desfasado (react-native 0.88.0 frente a 0.88.1 del lock); se reinstaló con `npm ci` y quedó solo el desfase de safe-area-context y screens, corregido junto con las nuevas.
- `npx expo install` añadió: react-native-reanimated 4.7.1, react-native-worklets 0.13.0, react-native-gesture-handler ~3.3.0, expo-haptics ~58.0.8, expo-keep-awake ~58.0.4, @gorhom/bottom-sheet ^5.2.14, @shopify/flash-list 2.3.2, @expo-google-fonts/barlow-condensed ^0.4.1 e inter ^0.4.2; react-native-safe-area-context ~5.11.1 y react-native-screens ~4.30.1. Sin babel.config: babel-preset-expo carga el plugin de worklets.
- Único cambio de código: `GestureHandlerRootView` en `mobile/src/app/_layout.tsx`.
- Resultados: `npm run check` móvil con 56 archivos y 491 pruebas aprobadas; `expo export` Android e iOS (Hermes, 6,4 MB cada uno) con un archivo temporal que importaba los ocho módulos nuevos (retirado después); 60 E2E aprobadas en Chromium y WebKit (visual-foundations, workout-refresh, home-refresh, fluidity).
- Límites: no se ejecutó en teléfono; no se probó si Expo Go SDK 58 trae todos los módulos nativos (si no, se necesita build de desarrollo); no se corrió la regresión E2E completa de 566 casos; las fuentes aún no se cargan (T239); sin commit.
