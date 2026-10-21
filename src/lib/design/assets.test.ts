import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import publicAssets from "./assets.json";
import offlineAssets from "./offline-assets.json";
import { isPublicPath } from "@/lib/auth/route-access";
it("la descarga usa variantes válidas dentro del presupuesto y conserva las rutas anteriores", () => {
  let bytes = 0;
  for (const asset of offlineAssets) {
    expect(publicAssets).toContain(asset);
    expect(isPublicPath(asset)).toBe(true);
    const path = join("public", asset.slice(1)),
      data = readFileSync(path);
    bytes += statSync(path).size;
    expect(data.subarray(0, 4).toString()).toBe("RIFF");
    expect(data.subarray(8, 12).toString()).toBe("WEBP");
  }
  expect(bytes).toBeLessThanOrEqual(3306767 * 0.3);
  expect(offlineAssets.length).toBeGreaterThan(1);
  expect(offlineAssets.some((p) => p.endsWith(".png"))).toBe(false);
  expect(isPublicPath("/design/azul-atleta/hero-v1.png")).toBe(true);
  expect(isPublicPath("/design/azul-atleta/squat-v1.png")).toBe(true);
  expect(isPublicPath("/design/azul-atleta/private.webp")).toBe(false);
});
