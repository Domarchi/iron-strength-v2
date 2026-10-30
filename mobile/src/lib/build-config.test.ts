import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
type App = {
  name: string;
  scheme: string;
  owner: string;
  ios: { bundleIdentifier?: string; buildNumber?: string };
  android: { package?: string; versionCode?: number; blockedPermissions?: string[] };
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

for (const variant of ["preview", "production"]) {
  it(`${variant} excluye acceso a archivos externos y superposiciones heredados, conservando bloqueos previos`, () => {
    vi.stubEnv("APP_VARIANT", variant);
    const app = load()({
      config: {
        ...base,
        android: { ...base.android, blockedPermissions: ["android.permission.RECORD_AUDIO"] },
      },
    });
    expect(app.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.RECORD_AUDIO",
      ]),
    );
    expect(app.android.blockedPermissions).not.toContain("android.permission.INTERNET");
    expect(base.android.blockedPermissions).toBeUndefined();
  });
}

it("calidad local exige un origen HTTPS de pruebas y aísla instalación/datos", () => {
  vi.stubEnv("APP_VARIANT", "quality");
  for (const origin of [
    undefined,
    "https://iron-strength-seven.vercel.app",
    "http://127.0.0.1:3100",
    "https://prueba.trycloudflare.com/ruta",
    "https://user:pass@prueba.trycloudflare.com",
  ]) {
    vi.stubEnv("EXPO_PUBLIC_API_URL", origin);
    expect(() => load()({ config: base })).toThrow("pruebas");
  }
  vi.stubEnv("EXPO_PUBLIC_API_URL", "https://prueba-nativa.trycloudflare.com");
  const app = load()({ config: base });
  expect(app.name).toBe("Iron Strength Pruebas");
  expect(app.android.package).toBe("com.domarchis.ironstrength.quality");
  expect(app.ios.bundleIdentifier).toBe("com.domarchis.ironstrength.quality");
  expect(app.scheme).toBe("iron-strength-quality");
  expect(app.extra.eas.projectId).toBe(base.extra.eas.projectId);
  expect(app.android.blockedPermissions).toContain("android.permission.SYSTEM_ALERT_WINDOW");
  vi.stubEnv("EAS_BUILD", "true");
  expect(() => load()({ config: base })).toThrow("local");
});

describe("calidad remota solo para el simulador iOS", () => {
  function remoteQuality() {
    vi.stubEnv("APP_VARIANT", "quality");
    vi.stubEnv("EAS_BUILD", "true");
    vi.stubEnv("EAS_BUILD_PLATFORM", "ios");
    vi.stubEnv("EAS_BUILD_PROFILE", "quality-simulator");
    vi.stubEnv("IRON_QUALITY_SIMULATOR", "1");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://prueba-nativa.trycloudflare.com");
  }
  it("conserva la identidad aislada con el perfil de simulador explícito", () => {
    remoteQuality();
    const app = load()({ config: base });
    expect(app.ios.bundleIdentifier).toBe("com.domarchis.ironstrength.quality");
    expect(app.scheme).toBe("iron-strength-quality");
    expect(app.name).toBe("Iron Strength Pruebas");
    expect(app.extra.eas.projectId).toBe(base.extra.eas.projectId);
  });
  it.each([
    ["EAS_BUILD_PLATFORM", "android"],
    ["EAS_BUILD_PLATFORM", undefined],
    ["EAS_BUILD_PROFILE", "preview-simulator"],
    ["EAS_BUILD_PROFILE", "production"],
    ["EAS_BUILD_PROFILE", undefined],
    ["IRON_QUALITY_SIMULATOR", "0"],
    ["IRON_QUALITY_SIMULATOR", undefined],
  ])("rechaza un build remoto con %s=%s", (key, value) => {
    remoteQuality();
    vi.stubEnv(key, value);
    expect(() => load()({ config: base })).toThrow("local");
  });
  it.each([
    undefined,
    "https://iron-strength-seven.vercel.app",
    "http://prueba-nativa.trycloudflare.com",
    "https://prueba-nativa.trycloudflare.com/ruta",
    "https://prueba-nativa.trycloudflare.com?url=otro",
  ])("las guardas remotas no conceden otro origen: %s", (origin) => {
    remoteQuality();
    vi.stubEnv("EXPO_PUBLIC_API_URL", origin);
    expect(() => load()({ config: base })).toThrow("pruebas");
  });
  it("el perfil no puede construir un dispositivo, usar dev-client ni elegir producción por omisión", () => {
    const eas = JSON.parse(readFileSync(new URL("../../eas.json", import.meta.url), "utf8"));
    const profile = eas.build["quality-simulator"];
    expect(profile).toBeDefined();
    expect(profile.extends).toBeUndefined();
    expect(profile.ios.simulator).toBe(true);
    expect(profile.developmentClient).toBe(false);
    expect(profile.distribution).toBe("internal");
    expect(profile.env.APP_VARIANT).toBe("quality");
    expect(profile.env.IRON_QUALITY_SIMULATOR).toBe("1");
    expect(profile.env.EXPO_PUBLIC_API_URL).toBeUndefined();
    expect(profile.env.EXPO_PUBLIC_ALLOW_LOCAL_API).toBe("0");
  });
});
