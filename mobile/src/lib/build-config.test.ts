import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
type App = {
  name: string;
  scheme: string;
  owner: string;
  ios: { bundleIdentifier?: string; buildNumber?: string };
  android: { package?: string; versionCode?: number };
  extra: { eas: { projectId: string } };
};
const base = JSON.parse(readFileSync(new URL("../../app.json", import.meta.url), "utf8"))
  .expo as App;
const load = () =>
  require("../../app.config.js") as (context: { config: typeof base }) => typeof base;
afterEach(() => vi.unstubAllEnvs());
describe("variantes instalables", () => {
  it("conserva Expo Go y la identidad EAS sin una variante explícita", () => {
    vi.stubEnv("APP_VARIANT", undefined);
    const app = load()({ config: base });
    expect(app.name).toBe("Iron Strength");
    expect(app.scheme).toBe("iron-strength");
    expect(app.owner).toBe(base.owner);
    expect(app.extra.eas.projectId).toBe(base.extra.eas.projectId);
  });
  it("separa IDs, nombres y enlaces de las tres instalaciones", () => {
    const apps = ["development", "preview", "production"].map((value) => {
      vi.stubEnv("APP_VARIANT", value);
      return load()({ config: base });
    });
    expect(new Set(apps.map((app) => app.ios.bundleIdentifier)).size).toBe(3);
    expect(new Set(apps.map((app) => app.android.package)).size).toBe(3);
    expect(new Set(apps.map((app) => app.scheme)).size).toBe(3);
    expect(new Set(apps.map((app) => app.name)).size).toBe(3);
    expect(apps.every((app) => app.extra.eas.projectId === base.extra.eas.projectId)).toBe(true);
  });
  it("rechaza una variante desconocida sin caer silenciosamente en producción", () => {
    vi.stubEnv("APP_VARIANT", "unknown");
    expect(() => load()({ config: base })).toThrow("APP_VARIANT");
  });
});

it("respeta incrementos locales de versión antes de una nueva entrega", () => {
  const app = load()({
    config: {
      ...base,
      ios: { ...base.ios, buildNumber: "7" },
      android: { ...base.android, versionCode: 7 },
    },
  });
  expect(app.ios.buildNumber).toBe("7");
  expect(app.android.versionCode).toBe(7);
});
