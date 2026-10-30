import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
const require = createRequire(import.meta.url);
const {
  TARGET,
  readCaptureInputs,
  verifyCaptureTarget,
  chooseCaptureTemplate,
  verifyCaptureSequence,
  captureFlow,
} = require("../../scripts/run-ios-store-captures.cjs");
const id = "11111111-1111-4111-8111-111111111111";
const env = {
  IOS_CAPTURE_ACCOUNT_ID: id,
  IOS_CAPTURE_API_ORIGIN: "https://manufacturer-academic-contractor-shades.trycloudflare.com",
  IOS_CAPTURE_BACKEND_ORIGIN: "https://deals-terrorists-ads-dos.trycloudflare.com",
  IOS_CAPTURE_BACKEND_BUILD_ID: "aef39df9649f4da68845dd9290e81629",
  IRON_IOS_CAPTURE_EMAIL: "fictional@iron-strength.test",
  IRON_IOS_CAPTURE_PASSWORD: "fictional-credential-only",
};
it("admite solo los dos dominios de demostración y el backend del artefacto", () => {
  expect(readCaptureInputs(env).accountId).toBe(id);
  expect(
    readCaptureInputs({ ...env, IRON_IOS_CAPTURE_EMAIL: "fixture@iron-strength.e2e.test" }).email,
  ).toBe("fixture@iron-strength.e2e.test");
  expect(TARGET.buildId).toBe("70774fb1-e41e-4e7c-9b87-97369911900a");
});
it.each([
  { IRON_IOS_CAPTURE_EMAIL: "owner@gmail.com" },
  { IRON_IOS_CAPTURE_EMAIL: "fixture@iron-strength.test.evil" },
  { IRON_IOS_CAPTURE_EMAIL: "fixture@other.test" },
  { IRON_IOS_CAPTURE_PASSWORD: "" },
  { IRON_IOS_CAPTURE_PASSWORD: "credential\nnot-valid" },
  { IOS_CAPTURE_API_ORIGIN: "https://iron-strength-seven.vercel.app" },
  { IOS_CAPTURE_API_ORIGIN: env.IOS_CAPTURE_API_ORIGIN + "/path" },
  {
    IOS_CAPTURE_API_ORIGIN:
      "https://user:pass@manufacturer-academic-contractor-shades.trycloudflare.com",
  },
  { IOS_CAPTURE_BACKEND_ORIGIN: "https://other.trycloudflare.com" },
  { IOS_CAPTURE_BACKEND_BUILD_ID: "d".repeat(32) },
  { IOS_CAPTURE_ACCOUNT_ID: "unsafe'account" },
])("rechaza entradas ajenas a la operación aislada: %j", (patch) => {
  expect(() => readCaptureInputs({ ...env, ...patch })).toThrow();
});
const bundle = Buffer.concat([Buffer.from("c61fbc03c103191f", "hex"), Buffer.alloc(64)]);
const hash = createHash("sha256").update(bundle).digest("hex");
const info = {
  CFBundleIdentifier: "com.domarchis.ironstrength.quality",
  CFBundleVersion: "8",
  CFBundleShortVersionString: "0.1.0",
  CFBundleExecutable: "IronStrengthPruebas",
  CFBundleSupportedPlatforms: ["iPhoneSimulator"],
};
it("vincula el capturador solo a quality8 y sus bytes", () => {
  expect(verifyCaptureTarget(info, bundle, hash).bundleSha256).toBe(hash);
  expect(() => verifyCaptureTarget(info, bundle)).toThrow();
});
it.each([
  { CFBundleIdentifier: "com.domarchis.ironstrength.preview" },
  { CFBundleVersion: "7" },
  { CFBundleExecutable: "../another" },
  { CFBundleSupportedPlatforms: ["iPhoneOS"] },
  { CFBundleSupportedPlatforms: ["iPhoneSimulator", "iPhoneOS"] },
])("rechaza otro binario antes de instalar: %j", (patch) => {
  expect(() => verifyCaptureTarget({ ...info, ...patch }, bundle, hash)).toThrow();
});
const runtime = (version: string, name: string, available = true) => ({
  identifier: "com.apple.CoreSimulator.SimRuntime.iOS-" + version,
  isAvailable: available,
  supportedDeviceTypes: [
    { name, identifier: "com.apple.CoreSimulator.SimDeviceType." + name.replaceAll(" ", "-") },
  ],
});
it("prefiere un Air disponible y devuelve solo una plantilla para crear un simulador nuevo", () => {
  const got = chooseCaptureTemplate(
    { devices: {} },
    {
      runtimes: [
        runtime("27-1", "iPhone Duo"),
        runtime("27-0", "iPhone Air"),
        runtime("27-1", "iPhone 18 Pro Max"),
      ],
    },
  );
  expect(got).toEqual({
    name: "iPhone Air",
    runtime: "com.apple.CoreSimulator.SimRuntime.iOS-27-0",
    deviceType: "com.apple.CoreSimulator.SimDeviceType.iPhone-Air",
  });
  expect(got).not.toHaveProperty("udid");
});
it("usa Pro Max si Air no está disponible, sin reutilizar un UDID existente", () => {
  const runtimes = {
    runtimes: [runtime("27-0", "iPhone Air", false), runtime("27-1", "iPhone 18 Pro Max")],
  };
  expect(chooseCaptureTemplate({ devices: {} }, runtimes).name).toBe("iPhone 18 Pro Max");
});
it("rechaza plantillas de otro dispositivo, no disponibles o anteriores al mínimo", () => {
  for (const runtimes of [
    [runtime("27-1", "iPhone Duo")],
    [runtime("27-0", "iPhone Air", false)],
    [runtime("16-3", "iPhone 14 Pro Max")],
  ])
    expect(() => chooseCaptureTemplate({ devices: {} }, { runtimes })).toThrow();
});
const captures = () =>
  ["home-dark", "workout", "progress", "home-light"].map((name, i) => ({
    name: name + ".png",
    sha256: String(i + 1).repeat(64),
    bytes: 100000,
    width: 1260,
    height: 2736,
  }));
it("acepta cuatro originales verticales completos y diferentes", () => {
  expect(verifyCaptureSequence(captures())).toBe(true);
});
it("rechaza imágenes incompletas, repetidas, ajenas o de otra geometría", () => {
  const valid = captures();
  for (const bad of [
    valid.slice(0, 3),
    [...valid].reverse(),
    valid.map((v) => ({ ...v, sha256: "a".repeat(64) })),
    valid.map((v) => ({ ...v, width: 1398, height: 2034 })),
    valid.map((v) => ({ ...v, bytes: 100 })),
    valid.map((v) => ({ ...v, sha256: "bad" })),
  ])
    expect(() => verifyCaptureSequence(bad)).toThrow();
});
it("las fases usan la UI, conservan estado y descartan sin finalizar o enviar un entrenamiento", () => {
  const login = captureFlow("login");
  expect(login).toContain("clearState: false");
  expect(login).toContain("clearKeychain: false");
  expect(login).toContain("${QA_PASSWORD}");
  expect(login).not.toContain(env.IRON_IOS_CAPTURE_PASSWORD);
  const workout = captureFlow("workout");
  expect(workout).toContain('"Completar serie 1"');
  expect(workout).toContain("eraseText");
  const discard = captureFlow("discard");
  expect(discard).toContain('"Confirmar descarte"');
  expect(discard).not.toContain("Finalizar entrenamiento");
  for (const name of ["login", "home-dark", "workout", "discard", "progress", "home-light"])
    expect(captureFlow(name)).not.toMatch(
      /clearState: true|clearKeychain: true|Confirmar y guardar|Finalizar entrenamiento/,
    );
  expect(() => captureFlow("unexpected")).toThrow();
});

it("cierra solo la oferta nativa de guardar la clave ficticia, sin almacenarla", () => {
  const login = captureFlow("login");
  expect(login).toContain('visible: "Save Password.*"');
  expect(login).toContain('tapOn: "Not Now"');
  expect(login).not.toContain('tapOn: "Save"');
});
