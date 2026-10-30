import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
const require = createRequire(import.meta.url);
const {
  verifySimulatorTarget,
  chooseSimulatorTemplate,
  parseLaunchPid,
  previewCaptureFlow,
  verifyCaptureSequence,
} = require("../../scripts/smoke-ios-simulator.cjs");
const bundle = Buffer.concat([Buffer.from("c61fbc03c103191f", "hex"), Buffer.alloc(64, 1)]);
const hash = createHash("sha256").update(bundle).digest("hex");
const info = {
  CFBundleIdentifier: "com.domarchis.ironstrength.preview",
  CFBundleShortVersionString: "0.1.0",
  CFBundleVersion: "8",
  CFBundleSupportedPlatforms: ["iPhoneSimulator"],
  CFBundleExecutable: "IronStrengthPreview",
};
it("reconoce solo el preview de simulador y bytes seleccionados", () => {
  expect(verifySimulatorTarget(info, bundle, hash)).toEqual({
    appId: info.CFBundleIdentifier,
    buildNumber: "8",
    bundleSha256: hash,
    executable: "IronStrengthPreview",
  });
});
it.each([
  { CFBundleIdentifier: "com.domarchis.ironstrength" },
  { CFBundleVersion: "7" },
  { CFBundleSupportedPlatforms: ["iPhoneOS"] },
  { CFBundleShortVersionString: "0.2.0" },
  { CFBundleExecutable: "../another" },
])("rechaza otra identidad o plataforma antes del lanzamiento: %j", (patch) => {
  expect(() => verifySimulatorTarget({ ...info, ...patch }, bundle, hash)).toThrow();
});
it("rechaza un bundle distinto aunque la versión coincida", () => {
  expect(() =>
    verifySimulatorTarget(info, Buffer.concat([bundle, Buffer.from("changed")]), hash),
  ).toThrow();
});
it("rechaza una referencia de hash ausente o incompleta", () => {
  expect(() => verifySimulatorTarget(info, bundle, "")).toThrow();
});
it("elige una plantilla iPhone disponible del runtime iOS más reciente", () => {
  const row = (name: string, type: string) => ({
    isAvailable: true,
    name,
    deviceTypeIdentifier: type,
    udid: "never-reuse-this",
  });
  const got = chooseSimulatorTemplate({
    devices: {
      "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [
        row("iPhone 16", "com.apple.CoreSimulator.SimDeviceType.iPhone-16"),
      ],
      "com.apple.CoreSimulator.SimRuntime.iOS-27-0": [
        row("iPhone Air", "com.apple.CoreSimulator.SimDeviceType.iPhone-Air"),
      ],
      "com.apple.CoreSimulator.SimRuntime.watchOS-27-0": [row("watch", "watch")],
    },
  });
  expect(got).toEqual({
    runtime: "com.apple.CoreSimulator.SimRuntime.iOS-27-0",
    deviceType: "com.apple.CoreSimulator.SimDeviceType.iPhone-Air",
    name: "iPhone Air",
  });
  expect(got).not.toHaveProperty("udid");
});
it("no acepta una plantilla ausente, no disponible o de otro dispositivo", () => {
  expect(() =>
    chooseSimulatorTemplate({
      devices: {
        "com.apple.CoreSimulator.SimRuntime.iOS-27-0": [
          {
            isAvailable: false,
            name: "iPhone",
            deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-Air",
          },
        ],
      },
    }),
  ).toThrow();
});
it("extrae el PID únicamente del identificador seleccionado", () => {
  expect(parseLaunchPid("com.domarchis.ironstrength.preview: 12345")).toBe(12345);
  expect(() => parseLaunchPid("another.app: 12345")).toThrow();
  expect(() => parseLaunchPid("com.domarchis.ironstrength.preview: nope")).toThrow();
});

const captures = ["login-dark.png", "login-light.png", "login-reopened.png"].map((name, i) => ({
  name,
  sha256: String(i + 1).repeat(64),
  bytes: 12000,
}));
it("exige la secuencia completa y diferencias entre oscuro y claro", () => {
  expect(verifyCaptureSequence(captures)).toBe(true);
});
it("rechaza las tres capturas idénticas que produjo simctl", () => {
  expect(() =>
    verifyCaptureSequence(captures.map((p) => ({ ...p, sha256: "a".repeat(64) }))),
  ).toThrow();
});
it("rechaza capturas incompletas o nombres ajenos", () => {
  expect(() => verifyCaptureSequence(captures.slice(0, 2))).toThrow();
  expect(() =>
    verifyCaptureSequence([{ ...captures[0], name: "other.png" }, ...captures.slice(1)]),
  ).toThrow();
});
it("rechaza hash o tamaño inválidos sin afirmar aceptación visual", () => {
  expect(() =>
    verifyCaptureSequence([{ ...captures[0], sha256: "" }, ...captures.slice(1)]),
  ).toThrow();
  expect(() =>
    verifyCaptureSequence([{ ...captures[0], bytes: 1 }, ...captures.slice(1)]),
  ).toThrow();
});
it("la captura de preview solo activa y observa acceso sin credenciales o borrado", () => {
  const flow = previewCaptureFlow("login-dark");
  expect(flow).toContain("clearState: false");
  expect(flow).toContain("stopApp: false");
  expect(flow).toContain('assertVisible: "Inicia sesión"');
  expect(flow).toContain("takeScreenshot: login-dark");
  expect(flow).not.toMatch(/inputText|tapOn|clearState: true|stopApp: true|openLink/);
});
it("no genera rutas de captura fuera del conjunto cerrado", () => {
  expect(() => previewCaptureFlow("../another")).toThrow();
});
