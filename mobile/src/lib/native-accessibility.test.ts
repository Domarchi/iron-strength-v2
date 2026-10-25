import { expect, it } from "vitest";
import { globSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const appRoot = fileURLToPath(new URL("../", import.meta.url));
it("los roles literales de la app existen en el lector Android del SDK instalado", () => {
  const nativeRoot = dirname(require.resolve("react-native/package.json"));
  const source = readFileSync(
    join(
      nativeRoot,
      "ReactAndroid/src/main/java/com/facebook/react/uimanager/ReactAccessibilityDelegate.kt",
    ),
    "utf8",
  );
  const roles = source.match(/enum class AccessibilityRole\s*\{([\s\S]*?);/);
  expect(
    roles,
    "Debe leerse el contrato real del SDK, sin dar por válido un formato desconocido",
  ).not.toBeNull();
  const supported = new Set(
    [...roles![1].matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*(?:,|$)/gm)].map((m) => m[1].toLowerCase()),
  );
  expect(supported.has("button")).toBe(true);
  expect(supported.has("toolbar")).toBe(true);
  expect(supported.has("status")).toBe(false);
  const unsupported: string[] = [];
  for (const file of globSync("**/*.tsx", { cwd: appRoot })) {
    for (const role of readFileSync(join(appRoot, file), "utf8").matchAll(
      /accessibilityRole=["']([^"']+)["']/g,
    )) {
      if (!supported.has(role[1]))
        unsupported.push(`${relative(appRoot, join(appRoot, file))}: ${role[1]}`);
    }
  }
  expect(unsupported).toEqual([]);
});
