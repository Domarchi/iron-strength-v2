# Recursos de Azul atleta

La referencia aprobada se conserva en [reference-a.png](reference-a.png). Los recursos se generaron con la herramienta integrada ImageGen (sin API/CLI externa) y se inspeccionaron antes de copiarlos al proyecto. Son decorativos: el nombre, la prescripción y los valores son texto real, no están incrustados en las imágenes. La sentadilla ilustrada se usa exclusivamente para Sentadilla y Sentadilla con barra; los demás movimientos conservan las miniaturas SVG propias.

- `public/design/azul-atleta/hero-v1.png`: fotografía original, 1536 × 1024, 2 MB. Próxima sesión.
- `public/design/azul-atleta/squat-v1.png`: ilustración original con transparencia, 1280 × 1280, 1,2 MB. Registro y biblioteca.
- Lista pública cerrada y recursos offline: `src/lib/design/assets.json`. Las pruebas verifican acceso sin sesión, caché exacto y carga sin transporte.

## Prompts finales

### Hero

Create a production bitmap asset for Iron Strength, an original strength training app. A wide cinematic photographic background, ratio 3:2, approximately 1024x680. Athletic adult in a dark charcoal t-shirt performing a barbell back squat in a minimal modern squat rack. Athlete and barbell occupy the RIGHT third of the composition, left two thirds mostly empty deep navy negative space. Rich midnight navy #071c35, cobalt blue rim lighting, dark steel gym, subtle realistic texture. Clear elegant silhouette, disciplined premium sports editorial lighting. This image will sit behind white interface text and a blue button; do NOT draw any text, typography, buttons, logos, watermarks, UI or frames. No collage. Realistic safe equipment, original fictional person.

### Sentadilla (transparent_background: true)

Use case stylized-concept. Production asset for a strength training app: one full-body original monochrome silver graphite 3D athletic adult figure in a controlled barbell back squat, three-quarter view, wearing simple charcoal fitted shorts and shoes. Matte light gray skin, realistic modest proportions, clean detailed form like a premium fitness exercise library render. Barbell balanced across upper back, hands symmetrical and visible, both feet on same plane. Entire bar and plates visible with padding. Centered figure fills frame, compact square approximately1024x1024. Transparent background with genuine alpha, no floor or scenery, no backdrop, no checkerboard, no text, no logos, no watermark, no UI. Neutral studio lighting, bright silver highlights so readable on both navy and pale backgrounds. Original image, not from any existing app.
