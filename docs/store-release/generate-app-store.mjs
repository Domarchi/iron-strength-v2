import fs from "node:fs/promises";
import crypto from "node:crypto";
import sharp from "sharp";
import { format } from "prettier";

const directory = new URL("./assets/app-store/", import.meta.url);
const names = ["home-dark", "workout", "progress", "home-light"];
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const isSha = (value) => /^[a-f0-9]{64}$/.test(value ?? "");
const isCommit = (value) => /^[a-f0-9]{40}$/.test(value ?? "");
const isId = (value) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value ?? "");
function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}
const source = JSON.parse(await fs.readFile(new URL("source/capture.json", directory), "utf8"));
if (
  !exactKeys(source, [
    "formatVersion",
    "platform",
    "method",
    "capturedAt",
    "fictitiousData",
    "productionCandidate",
    "originalsReviewed",
    "artifact",
    "capture",
    "images",
  ]) ||
  source.formatVersion !== 1 ||
  source.platform !== "iOS" ||
  source.method !== "maestro-takeScreenshot" ||
  !Number.isFinite(Date.parse(source.capturedAt)) ||
  source.fictitiousData !== true ||
  source.productionCandidate !== false ||
  source.originalsReviewed !== true ||
  !exactKeys(source.artifact, [
    "applicationId",
    "version",
    "buildNumber",
    "buildId",
    "sourceCommit",
    "archiveSha256",
    "bundleSha256",
    "mapSha256",
    "expoVersion",
    "reactNativeVersion",
    "mappedSourceContents",
  ]) ||
  source.artifact.applicationId !== "com.domarchis.ironstrength.quality" ||
  !/^\d+\.\d+\.\d+$/.test(source.artifact.version ?? "") ||
  !/^[1-9]\d*$/.test(source.artifact.buildNumber ?? "") ||
  !isId(source.artifact.buildId) ||
  !isCommit(source.artifact.sourceCommit) ||
  !["archiveSha256", "bundleSha256", "mapSha256"].every((key) => isSha(source.artifact[key])) ||
  !["expoVersion", "reactNativeVersion"].every((key) =>
    /^\d+\.\d+\.\d+$/.test(source.artifact[key] ?? ""),
  ) ||
  !Number.isInteger(source.artifact.mappedSourceContents) ||
  source.artifact.mappedSourceContents < 1 ||
  !exactKeys(source.capture, ["workflowId", "harnessSourceCommit", "device", "runtime"]) ||
  !isId(source.capture.workflowId) ||
  !isCommit(source.capture.harnessSourceCommit) ||
  !/^iPhone (?:Air|(?:14|15|16|17|18) Pro Max)$/.test(source.capture.device ?? "") ||
  !/^com\.apple\.CoreSimulator\.SimRuntime\.iOS-\d+-\d+(?:-\d+)?$/.test(
    source.capture.runtime ?? "",
  ) ||
  !exactKeys(source.images, names) ||
  !names.every((name) => isSha(source.images[name])) ||
  new Set(Object.values(source.images)).size !== names.length
)
  throw Error("Procedencia iOS incompleta o campos privados/no previstos");

// Validate every source before replacing any prior export. No image processing:
// the exported PNG is byte-for-byte identical to its reviewed native original.
const images = [];
for (const name of names) {
  const bytes = await fs.readFile(new URL("source/" + name + ".png", directory));
  if (sha(bytes) !== source.images[name])
    throw Error("La captura no coincide con su procedencia iOS");
  const m = await sharp(bytes).metadata();
  if (
    m.format !== "png" ||
    m.channels !== 3 ||
    m.hasAlpha ||
    m.space !== "srgb" ||
    m.depth !== "uchar" ||
    ![
      [1260, 2736],
      [1290, 2796],
      [1320, 2868],
    ].some(([w, h]) => m.width === w && m.height === h)
  )
    throw Error("La captura nativa no es RGB opaca o tiene dimensiones inesperadas");
  images.push({ name, bytes, width: m.width, height: m.height });
}
const descriptions = [
  ["Tu semana a mano", "Semana con siguiente rutina y avance de sesiones en tema oscuro."],
  ["Registra cada serie", "Registro de entrenamiento con peso, repeticiones y descanso."],
  [
    "Progreso con contexto",
    "Volumen del ejercicio en doce semanas, con resultados existentes de demostración.",
  ],
  ["Elige claro u oscuro", "Inicio en tema claro con siguiente rutina y avance semanal."],
];
const manifest = {
  status: "Borradores QA; recapturar y revisar con el candidato de producción antes de enviar",
  platform: "iOS",
  captureSource: source,
  screenshots: [],
};
for (const [index, image] of images.entries()) {
  const file = String(index + 1).padStart(2, "0") + "-" + image.name + ".png";
  const [title, altText] = descriptions[index];
  await fs.writeFile(new URL(file, directory), image.bytes);
  const actual = await fs.readFile(new URL(file, directory));
  if (!actual.equals(image.bytes)) throw Error("La exportación alteró el original");
  manifest.screenshots.push({
    file,
    title,
    altText,
    width: image.width,
    height: image.height,
    channels: 3,
    bytes: actual.length,
    sha256: sha(actual),
    source: "source/" + image.name + ".png",
    sourceSha256: sha(image.bytes),
    originalBytesPreserved: true,
  });
}
await fs.writeFile(
  new URL("manifest.json", directory),
  await format(JSON.stringify(manifest), { parser: "json" }),
);
console.log("Cuatro PNG iOS exportados; bytes originales y procedencia verificados.");
