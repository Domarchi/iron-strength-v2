import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { format } from "prettier";

// Misma geometría y colores que src/lib/pwa/icon-art.tsx; exportación vectorial,
// sin ampliar el bitmap de 512 px usado por los previews actuales.
const directory = new URL("./assets/", import.meta.url);
const size = 512;
const width = size * 0.64;
const gap = width * 0.02;
const plateWidth = width * 0.14;
const innerWidth = width * 0.1;
const barHeight = width * 0.1;
const shapes = [
  [plateWidth, width * 0.62, plateWidth * 0.3],
  [innerWidth, width * 0.42, innerWidth * 0.3],
  [width - 2 * (plateWidth + innerWidth + gap * 2), barHeight, barHeight * 0.4],
  [innerWidth, width * 0.42, innerWidth * 0.3],
  [plateWidth, width * 0.62, plateWidth * 0.3],
];
let left = (size - width) / 2;
const rectangles = shapes.map(([w, h, radius]) => {
  const rect = `<rect x="${left}" y="${(size - h) / 2}" width="${w}" height="${h}" rx="${radius}" />`;
  left += w + gap;
  return rect;
});
const svg = await format(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512"><title>Iron Strength</title><rect width="512" height="512" fill="#111214"/><g fill="#68b0ff">${rectangles.join("")}</g></svg>`,
  { parser: "html" },
);
await fs.mkdir(directory, { recursive: true });
await fs.writeFile(new URL("icon-source.svg", directory), svg);
const icons = [
  { name: "app-icon-1024.png", size: 1024, alpha: false },
  { name: "play-icon-512.png", size: 512, alpha: true },
];
for (const icon of icons) {
  let picture = sharp(Buffer.from(svg)).resize(icon.size, icon.size);
  picture = icon.alpha ? picture.ensureAlpha() : picture.removeAlpha();
  const output = fileURLToPath(new URL(icon.name, directory));
  await picture.png().toFile(output);
  const metadata = await sharp(output).metadata();
  if (
    metadata.width !== icon.size ||
    metadata.height !== icon.size ||
    metadata.hasAlpha !== icon.alpha ||
    metadata.channels !== (icon.alpha ? 4 : 3)
  )
    throw Error("Exportación de icono incompatible");
  console.log(`${icon.name}: ${icon.size} px, ${metadata.channels} canales`);
}
