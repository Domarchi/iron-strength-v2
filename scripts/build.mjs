import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
// Una versión por compilación; todos los procesos de Next reciben la misma identidad.
const buildId = randomUUID().replaceAll("-", "");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  stdio: "inherit",
  env: { ...process.env, IRON_BUILD_ID: buildId },
});
const code = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("exit", (status) => resolve(status ?? 1));
});
if (code !== 0) process.exit(Number(code));
await import("./generate-offline.mjs");
