import { describe, expect, it } from "vitest";
import { auditNativeRuntime } from "./native-runtime-audit";

const baseline = [
  "/node_modules/react-native/src/setup-env.js",
  "/node_modules/expo-router/entry.js",
  "/node_modules/zod/index.js",
  "/node_modules/expo/node_modules/@expo/cli/build/metro-require/require.js",
];
function sourceMap(extra: string[] = []) {
  const sources = [...baseline, ...extra];
  return { version: 3, sources, sourcesContent: sources.map(() => "source"), mappings: "AAAA" };
}
function report() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      expo: { severity: "high", nodes: ["node_modules/expo"], via: ["@expo/cli"] },
      "@expo/cli": {
        severity: "high",
        nodes: ["node_modules/expo/node_modules/@expo/cli"],
        via: ["zod"],
      },
      zod: {
        severity: "high",
        nodes: ["node_modules/expo/node_modules/zod"],
        via: [{ name: "zod", source: 1234 }],
      },
    },
  };
}

describe("avisos por módulo incluido en Hermes", () => {
  it("acepta el módulo virtual external-require emitido por Metro", () => {
    expect(
      auditNativeRuntime(report(), {
        android: sourceMap(["\0polyfill:external-require"]),
        ios: sourceMap(),
      }).ok,
    ).toBe(true);
  });

  it("rechaza caracteres nulos en otras rutas", () => {
    expect(
      auditNativeRuntime(report(), {
        android: sourceMap(["/node_modules/\0zod/index.js"]),
        ios: sourceMap(),
      }).code,
    ).toBe("invalid_source_map");
  });

  it("separa copias anidadas y avisos de contenedores sin ocultarlos", () => {
    const result = auditNativeRuntime(report(), { android: sourceMap(), ios: sourceMap() });
    expect(result).toMatchObject({ ok: true, installedPackagesWithWarnings: 3, inheritedOnly: 2 });
    expect(result.findings).toEqual([
      {
        package: "zod",
        severity: "high",
        affectedLocations: ["node_modules/expo/node_modules/zod"],
        platforms: [],
      },
    ]);
  });

  it.each(["android", "ios"] as const)("bloquea la copia vulnerable en %s", (platform) => {
    const maps = { android: sourceMap(), ios: sourceMap() };
    maps[platform] = sourceMap(["/node_modules/expo/node_modules/zod/lib/index.js"]);
    const result = auditNativeRuntime(report(), maps);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("affected_runtime_module");
    expect(result.findings[0].platforms).toEqual([platform]);
  });

  it("no confunde el prefijo de un nombre de paquete", () => {
    const result = auditNativeRuntime(report(), {
      android: sourceMap(["/node_modules/expo/node_modules/zod-shadow/index.js"]),
      ios: sourceMap(),
    });
    expect(result.ok).toBe(true);
  });

  it("normaliza separadores de Windows sin cambiar el árbol de dependencia", () => {
    const result = auditNativeRuntime(report(), {
      android: sourceMap(["C:\\app\\node_modules\\expo\\node_modules\\zod\\lib\\index.js"]),
      ios: sourceMap(),
    });
    expect(result.code).toBe("affected_runtime_module");
  });

  it("detecta nuevos avisos propios sin una lista de paquetes permitidos", () => {
    const audit = report();
    Object.assign(audit.vulnerabilities, {
      "@sample/parser": {
        severity: "moderate",
        nodes: ["node_modules/@sample/parser"],
        via: [{ name: "@sample/parser", source: 99 }],
      },
    });
    const result = auditNativeRuntime(audit, {
      android: sourceMap(),
      ios: sourceMap(["/node_modules/@sample/parser/index.js"]),
    });
    expect(result.code).toBe("affected_runtime_module");
    expect(result.findings.find((item) => item.package === "@sample/parser")?.platforms).toEqual([
      "ios",
    ]);
  });

  it.each([
    {},
    { error: { code: "network" } },
    { auditReportVersion: 3, vulnerabilities: {} },
    { auditReportVersion: 2, vulnerabilities: { x: { severity: "high", nodes: [], via: [] } } },
  ])("rechaza un informe incompleto o desconocido", (audit) => {
    expect(auditNativeRuntime(audit, { android: sourceMap(), ios: sourceMap() })).toMatchObject({
      ok: false,
      code: "invalid_audit",
    });
  });

  it.each([
    {},
    { version: 3, sources: [], sourcesContent: [], mappings: "" },
    { version: 3, sources: ["/src/app.js"], sourcesContent: ["x"], mappings: "AAAA" },
    { ...sourceMap(), sourcesContent: [] },
    sourceMap(["/node_modules/expo/../zod/index.js"]),
  ])("no acredita mapas vacíos, parciales o ambiguos", (android) => {
    expect(auditNativeRuntime(report(), { android, ios: sourceMap() })).toMatchObject({
      ok: false,
      code: "invalid_source_map",
    });
  });

  it("exige ambas plataformas", () => {
    expect(auditNativeRuntime(report(), { android: sourceMap() })).toMatchObject({
      ok: false,
      code: "invalid_source_map",
    });
  });

  it("rechaza una ubicación de aviso que pueda confundirse con otra raíz", () => {
    const audit = report();
    audit.vulnerabilities.zod.nodes = ["../other/node_modules/zod"];
    expect(auditNativeRuntime(audit, { android: sourceMap(), ios: sourceMap() }).code).toBe(
      "invalid_audit",
    );
  });
});
