import designAssets from "../src/lib/design/offline-assets.json" with { type: "json" };
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const dist = process.env.NEXT_DIST_DIR || ".next";
const buildId = (await readFile(path.join(dist, "BUILD_ID"), "utf8")).trim();
const files = await readdir(path.join(dist, "static"), { recursive: true, withFileTypes: true });
const assets = files
  .filter((f) => f.isFile() && /\.(?:js|css|woff2?)$/.test(f.name))
  .map(
    (f) =>
      "/_next/static/" +
      path
        .relative(path.join(dist, "static"), path.join(f.parentPath, f.name))
        .split(path.sep)
        .join("/"),
  )
  .sort();
if (!assets.length) throw new Error("No public build assets found");
assets.push(...designAssets);
assets.push("/offline", "/manifest.webmanifest", "/icons/192", "/icons/512", "/icons/maskable");
const source = await readFile("scripts/offline-worker.js", "utf8");
await mkdir("public/offline-workers", { recursive: true });
await writeFile(
  `public/offline-workers/${buildId}.js`,
  source
    .replace('"__IRON_BUILD_ID__"', JSON.stringify(buildId))
    .replace("/*__IRON_ASSETS__*/ []", JSON.stringify(assets)),
);
console.log(`Offline interface prepared: ${assets.length} public resources.`);
