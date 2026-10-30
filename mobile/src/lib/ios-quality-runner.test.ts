import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
const require = createRequire(import.meta.url);
const {
  readQualityInputs,
  verifyQualitySimulator,
  summarizeNativeStorage,
  redactQualityOutput,
  qualityResultRoute,
  verifyQualityResult,
} = require("../../scripts/run-ios-quality.cjs");
const id = "11111111-1111-4111-8111-111111111111";
const env = {
  IOS_QUALITY_BUILD_ID: id,
  IOS_QUALITY_ACCOUNT_ID: id,
  IOS_QUALITY_SOURCE_COMMIT: "a".repeat(40),
  IOS_QUALITY_BUNDLE_SHA256: "b".repeat(64),
  IOS_QUALITY_BACKEND_BUILD_ID: "c".repeat(32),
  IOS_QUALITY_API_ORIGIN: "https://qa-ios.trycloudflare.com",
  IRON_IOS_QUALITY_TEST_EMAIL: "technical@iron-strength.e2e.test",
  IRON_IOS_QUALITY_TEST_PASSWORD: "fictional-test-only",
  IRON_IOS_QUALITY_PROXY_TOKEN: "d".repeat(64),
};
it("acepta solo el destino y la cuenta técnica de QA, sin seleccionar producción", () => {
  const value = readQualityInputs(env);
  expect(value.apiOrigin).toBe("https://qa-ios.trycloudflare.com");
  expect(value.accountId).toBe(id);
});
it.each([
  { IRON_IOS_QUALITY_TEST_EMAIL: "owner@gmail.com" },
  { IRON_IOS_QUALITY_TEST_EMAIL: "technical@iron-strength.e2e.test.evil" },
  { IOS_QUALITY_API_ORIGIN: "https://iron-strength-seven.vercel.app" },
  { IOS_QUALITY_API_ORIGIN: "https://qa-ios.trycloudflare.com/path" },
  { IOS_QUALITY_API_ORIGIN: "https://user:pass@qa-ios.trycloudflare.com" },
  { IOS_QUALITY_API_ORIGIN: "http://qa-ios.trycloudflare.com" },
  { IOS_QUALITY_SOURCE_COMMIT: "short" },
  { IOS_QUALITY_ACCOUNT_ID: "other" },
  { IRON_IOS_QUALITY_TEST_PASSWORD: "" },
  { IRON_IOS_QUALITY_PROXY_TOKEN: "" },
])("rechaza entradas fuera del circuito técnico: %j", (patch) => {
  expect(() => readQualityInputs({ ...env, ...patch })).toThrow();
});
const bundle = Buffer.concat([Buffer.from("c61fbc03c103191f", "hex"), Buffer.alloc(64)]);
const hash = createHash("sha256").update(bundle).digest("hex");
const info = {
  CFBundleIdentifier: "com.domarchis.ironstrength.quality",
  CFBundleVersion: "7",
  CFBundleShortVersionString: "0.1.0",
  CFBundleExecutable: "IronStrengthPruebas",
  CFBundleSupportedPlatforms: ["iPhoneSimulator"],
};
it("vincula los bytes solo a la app quality de simulador", () => {
  expect(verifyQualitySimulator(info, bundle, hash).bundleSha256).toBe(hash);
  for (const patch of [
    { CFBundleIdentifier: "com.domarchis.ironstrength.preview" },
    { CFBundleSupportedPlatforms: ["iPhoneOS"] },
    { CFBundleVersion: "6" },
    { CFBundleExecutable: "../other" },
  ])
    expect(() => verifyQualitySimulator({ ...info, ...patch }, bundle, hash)).toThrow();
  expect(() =>
    verifyQualitySimulator(info, Buffer.concat([bundle, Buffer.from("changed")]), hash),
  ).toThrow();
});
function draft() {
  return {
    version: 4,
    userId: id,
    active: {
      activeIndex: 0,
      draft: {
        workoutId: id,
        rest: { endsAt: 90000 },
        exercises: [
          {
            sets: [
              { weight: "30", reps: "8", done: true },
              { weight: "", reps: "", done: false },
            ],
          },
        ],
      },
    },
  };
}
it("extrae la evidencia de serie, foco y descanso sin reescribir el registro", () => {
  const value = draft();
  const before = JSON.stringify(value);
  const proof = summarizeNativeStorage(before, null, id);
  expect(proof.active).toMatchObject({
    workoutId: id,
    completedSets: 1,
    activeIndex: 0,
    restEndsAt: 90000,
    firstSet: { weight: "30", reps: "8", done: true },
  });
  expect(JSON.stringify(value)).toBe(before);
});
it("rechaza una cuenta ajena o un formato futuro al inspeccionar SQLite", () => {
  expect(() =>
    summarizeNativeStorage(
      JSON.stringify({ ...draft(), userId: "22222222-2222-4222-8222-222222222222" }),
      null,
      id,
    ),
  ).toThrow();
  expect(() =>
    summarizeNativeStorage(JSON.stringify({ ...draft(), version: 999 }), null, id),
  ).toThrow();
  expect(() =>
    summarizeNativeStorage(
      null,
      JSON.stringify({ version: 3, userId: "22222222-2222-4222-8222-222222222222", entries: [] }),
      id,
    ),
  ).toThrow();
});
it("distingue un pendiente de una confirmación y compara el cuerpo congelado", () => {
  const entry = {
    payload: { id, version: 3, workout: { sets: [{ metrics: { weightKg: 30, reps: 8 } }] } },
    phase: "pending",
  };
  const queue = { version: 3, userId: id, entries: [entry] };
  const pending = summarizeNativeStorage(null, JSON.stringify(queue), id);
  const confirmed = summarizeNativeStorage(
    null,
    JSON.stringify({ ...queue, entries: [{ ...entry, phase: "confirmed" }] }),
    id,
  );
  expect(pending.entries[0].phase).toBe("pending");
  expect(pending.entries[0].payloadVersion).toBe(3);
  expect(confirmed.entries[0].phase).toBe("confirmed");
  expect(pending.entries[0].payloadSha256).toBe(confirmed.entries[0].payloadSha256);
});
it.each([1, 2, 3])(
  "verifica las dos métricas sin reinterpretar el contrato %i",
  (payloadVersion) => {
    const entry = { workoutId: id, payloadVersion };
    const metrics = [
      { weightKg: 30, reps: 8 },
      { weightKg: 32, reps: 9 },
    ];
    const result = {
      workout: {
        id,
        exercises: [{ sets: metrics.map((s) => (payloadVersion === 3 ? { metrics: s } : s)) }],
      },
    };
    expect(qualityResultRoute(entry)).toBe(
      `/api/mobile/v1/${payloadVersion === 3 ? "typed-recordings" : "workouts"}/${id}`,
    );
    expect(verifyQualityResult(result, entry)).toBe(2);
    expect(() =>
      verifyQualityResult({ workout: { ...result.workout, id: "other" } }, entry),
    ).toThrow();
    expect(() =>
      verifyQualityResult(
        { workout: { id, exercises: [{ sets: [{ weightKg: 32, reps: 98 }] }] } },
        entry,
      ),
    ).toThrow();
  },
);
it("rechaza contratos de resultado desconocidos en la evidencia", () => {
  expect(() => qualityResultRoute({ workoutId: id, payloadVersion: 99 })).toThrow();
});
it("retira credenciales en texto, JSON y XML sin ocultar un fallo técnico", () => {
  const secret = 'test<&"\\value';
  const raw =
    "native_flow_failed " +
    secret +
    " " +
    JSON.stringify(secret) +
    " test&lt;&amp;&quot;\\value " +
    "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJl";
  const result = redactQualityOutput(raw, [secret]);
  expect(result).toContain("native_flow_failed");
  expect(result).not.toContain(secret);
  expect(result).not.toContain(JSON.stringify(secret).slice(1, -1));
  expect(result).not.toContain("test&lt;");
  expect(result).not.toContain("eyJhbGci");
});
