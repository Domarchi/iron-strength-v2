import fs from "node:fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { format } from "prettier";

const directory = new URL("./assets/google-play/", import.meta.url);
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
const captureSource = JSON.parse(
  await fs.readFile(new URL("source/capture.json", directory), "utf8"),
);
function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}
const artifactKeys = [
  "applicationId",
  "versionName",
  "versionCode",
  "sourceCommit",
  "apkSha256",
  "bundleSha256",
  "mapSha256",
  "certificateSha256",
  "expoVersion",
  "reactNativeVersion",
  "mappedSourceContents",
];
const names = ["home-dark", "workout", "progress", "home-light"];
if (
  !exactKeys(captureSource, [
    "formatVersion",
    "platform",
    "method",
    "capturedAt",
    "fictitiousData",
    "productionCandidate",
    "artifact",
    "images",
  ]) ||
  captureSource.formatVersion !== 1 ||
  captureSource.platform !== "Android" ||
  captureSource.method !== "adb-exec-out-screencap" ||
  !Number.isFinite(Date.parse(captureSource.capturedAt)) ||
  captureSource.fictitiousData !== true ||
  captureSource.productionCandidate !== false ||
  !exactKeys(captureSource.artifact, artifactKeys) ||
  captureSource.artifact.applicationId !== "com.domarchis.ironstrength.quality" ||
  !/^\d+\.\d+\.\d+$/.test(captureSource.artifact.versionName) ||
  !Number.isInteger(captureSource.artifact.versionCode) ||
  captureSource.artifact.versionCode < 1 ||
  !/^[a-f0-9]{40}$/.test(captureSource.artifact.sourceCommit) ||
  !["apkSha256", "bundleSha256", "mapSha256", "certificateSha256"].every((key) =>
    /^[a-f0-9]{64}$/.test(captureSource.artifact[key]),
  ) ||
  !["expoVersion", "reactNativeVersion"].every((key) =>
    /^\d+\.\d+\.\d+$/.test(captureSource.artifact[key]),
  ) ||
  !Number.isInteger(captureSource.artifact.mappedSourceContents) ||
  captureSource.artifact.mappedSourceContents < 1 ||
  !exactKeys(captureSource.images, names) ||
  !names.every((name) => /^[a-f0-9]{64}$/.test(captureSource.images[name]))
)
  throw Error("Procedencia nativa incompleta o campos privados/no previstos");
// Verify every source before replacing any generated composition.
for (const name of names) {
  const bytes = await fs.readFile(new URL("source/" + name + ".png", directory));
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== captureSource.images[name])
    throw Error("La captura no coincide con la procedencia del APK verificado");
}
const items = [
  {
    file: "home-dark",
    title: "Tu semana a mano",
    alt: "Semana con siguiente rutina y avance de sesiones en tema oscuro.",
  },
  {
    file: "workout",
    title: "Registra cada serie",
    alt: "Registro de entrenamiento con peso, repeticiones y descanso.",
  },
  {
    file: "progress",
    title: "Progreso con contexto",
    alt: "Volumen del ejercicio en doce semanas, con los resultados existentes de demostración.",
  },
  {
    file: "home-light",
    title: "Elige claro u oscuro",
    alt: "Inicio en tema claro con siguiente rutina y avance semanal.",
  },
];
const manifest = {
  status: "Borradores; revisar con el candidato de producción antes de subir",
  platform: "Android",
  captureOrigin: "APK quality actual de T203; cuenta ficticia existente en instancia aislada",
  captureSource,
  font: "Noto Sans instalada en el sistema de generación",
  featureGraphic: null,
  screenshots: [],
};
async function save(name, svg, width, height) {
  const output = new URL(name + ".png", directory);
  if (name === "feature-graphic")
    await fs.writeFile(new URL(name + ".svg", directory), await format(svg, { parser: "html" }));
  await sharp(Buffer.from(svg)).removeAlpha().png().toFile(fileURLToPath(output));
  const data = await fs.readFile(output),
    m = await sharp(data).metadata();
  if (m.width !== width || m.height !== height || m.channels !== 3 || m.hasAlpha)
    throw Error("Dimensiones o canales inesperados");
  return {
    file: name + ".png",
    width,
    height,
    channels: 3,
    bytes: data.length,
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
  };
}
for (const [index, item] of items.entries()) {
  if (item.alt.length > 140) throw Error("Texto alternativo demasiado largo");
  const input = await fs.readFile(new URL("source/" + item.file + ".png", directory)),
    m = await sharp(input).metadata();
  if (m.width !== 1080 || m.height !== 2400) throw Error("La captura original cambió de tamaño");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="2560" viewBox="0 0 1440 2560"><title>${escape(item.alt)}</title><rect width="1440" height="2560" fill="#111214"/><g font-family="Noto Sans, sans-serif"><text x="180" y="38" fill="#68b0ff" font-size="22" font-weight="700" letter-spacing="2">IRON STRENGTH · ANDROID</text><text x="180" y="105" fill="#f4f4f6" font-size="54" font-weight="700">${escape(item.title)}</text><text x="180" y="143" fill="#a8a9b1" font-size="24">Datos de demostración · interfaz capturada de la app</text></g><image x="180" y="160" width="1080" height="2400" href="data:image/png;base64,${input.toString("base64")}"/></svg>`;
  const name = String(index + 1).padStart(2, "0") + "-" + item.file;
  const result = await save(name, svg, 1440, 2560);
  const actual = await sharp(fileURLToPath(new URL(result.file, directory)))
    .extract({ left: 180, top: 160, width: 1080, height: 2400 })
    .raw()
    .toBuffer();
  const original = await sharp(input).removeAlpha().raw().toBuffer();
  if (!actual.equals(original)) throw Error("Se alteraron los píxeles de la interfaz");
  manifest.screenshots.push({
    ...result,
    title: item.title,
    altText: item.alt,
    source: "source/" + item.file + ".png",
    sourceSha256: crypto.createHash("sha256").update(input).digest("hex"),
    originalPixelsPreserved: true,
  });
}
const graphic = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><title>Iron Strength: registra tus series y sigue tu planificación.</title><rect width="1024" height="500" fill="#152b4d"/><path d="M72 126v252" stroke="#68b0ff" stroke-width="5"/><g font-family="Noto Sans, sans-serif"><text x="108" y="155" fill="#a7ccff" font-size="19" font-weight="700" letter-spacing="2">IRON STRENGTH</text><text x="104" y="242" fill="#ffffff" font-size="70" font-weight="700">Tu plan.</text><text x="104" y="324" fill="#ffffff" font-size="70" font-weight="700">Serie a serie.</text><text x="108" y="377" fill="#c6d4e8" font-size="22">Registra. Revisa. Retoma.</text></g><g fill="none" stroke="#68b0ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="794" cy="192" r="18"/><path d="m785 192 6 6 12-13"/><circle cx="794" cy="252" r="18"/><path d="m785 252 6 6 12-13"/><circle cx="794" cy="312" r="18"/><path d="m785 312 6 6 12-13"/></g><g fill="#68b0ff"><rect x="836" y="186" width="92" height="12" rx="6"/><rect x="836" y="246" width="92" height="12" rx="6"/><rect x="836" y="306" width="92" height="12" rx="6"/></g></svg>`;
manifest.featureGraphic = {
  ...(await save("feature-graphic", graphic, 1024, 500)),
  altText: "Iron Strength: registra tus series y sigue tu planificación.",
  kind: "Gráfico vectorial; no es una captura de la app",
};
await fs.writeFile(new URL("manifest.json", directory), JSON.stringify(manifest, null, 2) + "\n");
console.log(
  "Cuatro capturas Android con píxeles originales intactos y gráfico 1024 × 500, PNG RGB.",
);
