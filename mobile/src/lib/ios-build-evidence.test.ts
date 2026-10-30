import { createRequire } from "node:module";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const paths: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "iron-ios-proof-"));
  paths.push(root);
  mkdirSync(join(root, "ios"));
  mkdirSync(join(root, ".build-evidence"));
  mkdirSync(join(root, "products", "Iron.app"), { recursive: true });
  const bundle = Buffer.concat([Buffer.from("c61fbc03c103191f", "hex"), Buffer.alloc(64, 7)]);
  writeFileSync(join(root, "products/Iron.app/main.jsbundle"), bundle);
  const map = {
    version: 3,
    sources: ["/src/app/index.tsx", "/node_modules/react-native/index.js"],
    sourcesContent: ["export default function Index(){}", "module.exports = {};"],
    names: [],
    mappings: "AAAA;ACAA",
  };
  writeFileSync(join(root, ".build-evidence/ios.map"), JSON.stringify(map));
  return {
    root,
    bundle,
    env: {
      PROJECT_DIR: join(root, "ios"),
      CONFIGURATION_BUILD_DIR: join(root, "products"),
      UNLOCALIZED_RESOURCES_FOLDER_PATH: "Iron.app",
      PRODUCT_BUNDLE_IDENTIFIER: "com.domarchis.ironstrength.preview",
      EAS_BUILD_ID: "11111111-1111-4111-8111-111111111111",
      EAS_BUILD_GIT_COMMIT_HASH: "a".repeat(40),
    },
  };
}
afterEach(() => {
  for (const p of paths.splice(0)) rmSync(p, { recursive: true, force: true });
});
it("conserva los mismos bytes y huellas del producto y mapa, sin variables privadas", () => {
  const f = fixture();
  const { captureIosBuildEvidence } = require("../../scripts/capture-ios-build-evidence.cjs");
  const proof = captureIosBuildEvidence({ ...f.env, SUPABASE_SECRET_KEY: "private-never-record" });
  expect(readFileSync(join(f.root, ".build-evidence/ios.hbc"))).toEqual(f.bundle);
  expect(proof.bundleSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(proof.mapSha256).toMatch(/^[a-f0-9]{64}$/);
  const saved = readFileSync(join(f.root, ".build-evidence/ios-proof.json"), "utf8");
  expect(JSON.parse(saved)).toEqual(proof);
  expect(saved).not.toContain("private-never-record");
  expect(saved).not.toContain(f.root);
});
it.each(["missing", "invalid", "empty", "wrong-version", "missing-content"])(
  "rechaza mapa %s sin acreditar el build",
  (mode) => {
    const f = fixture();
    const path = join(f.root, ".build-evidence/ios.map");
    if (mode === "missing") rmSync(path);
    else
      writeFileSync(
        path,
        mode === "invalid"
          ? "not-json"
          : JSON.stringify({
              version: mode === "wrong-version" ? 2 : 3,
              sources: mode === "empty" ? [] : ["/src/app/index.tsx"],
              sourcesContent: mode === "missing-content" ? [null] : ["export default 1"],
              names: [],
              mappings: "AAAA",
            }),
      );
    expect(() =>
      require("../../scripts/capture-ios-build-evidence.cjs").captureIosBuildEvidence(f.env),
    ).toThrow();
    expect(existsSync(join(f.root, ".build-evidence/ios-proof.json"))).toBe(false);
  },
);
it("rechaza un bundle no Hermes y no escribe una copia positiva", () => {
  const f = fixture();
  writeFileSync(join(f.root, "products/Iron.app/main.jsbundle"), "javascript plain");
  expect(() =>
    require("../../scripts/capture-ios-build-evidence.cjs").captureIosBuildEvidence(f.env),
  ).toThrow();
  expect(existsSync(join(f.root, ".build-evidence/ios-proof.json"))).toBe(false);
});
it.each(["../other.app", "/tmp/other.app"])("rechaza escape del producto %s", (path) => {
  const f = fixture();
  expect(() =>
    require("../../scripts/capture-ios-build-evidence.cjs").captureIosBuildEvidence({
      ...f.env,
      UNLOCALIZED_RESOURCES_FOLDER_PATH: path,
    }),
  ).toThrow();
});
it("conserva un destino ajeno en vez de seguir un enlace simbólico", () => {
  const f = fixture();
  const target = join(f.root, "untouched");
  writeFileSync(target, "keep");
  symlinkSync(target, join(f.root, ".build-evidence/ios.hbc"));
  expect(() =>
    require("../../scripts/capture-ios-build-evidence.cjs").captureIosBuildEvidence(f.env),
  ).toThrow();
  expect(readFileSync(target, "utf8")).toBe("keep");
});
it("decora una única fase CNG sin duplicarla y falla si no corresponde", () => {
  const { decorateBundlePhase } = require("../../plugins/with-ios-build-evidence.cjs");
  const original = 'set -e\n/bin/sh "react-native-xcode.sh"';
  const patched = decorateBundlePhase(original);
  expect(patched).toContain(original);
  expect(patched).toContain("SOURCEMAP_FILE");
  expect(patched).toContain("capture-ios-build-evidence.cjs");
  expect(patched).toContain("IRON_CAPTURE_IOS_BUILD_EVIDENCE");
  expect(decorateBundlePhase(patched)).toBe(patched);
  expect(() => decorateBundlePhase("echo another phase")).toThrow();
});

it.each([
  ["Release", "1", true],
  ["Debug", "1", false],
  ["Release", "0", false],
])(
  "ejecuta la fase real %s con captura %s sin cambiar Debug",
  (configuration, enabled, expected) => {
    const f = fixture();
    mkdirSync(join(f.root, "scripts"));
    writeFileSync(
      join(f.root, "scripts/capture-ios-build-evidence.cjs"),
      readFileSync(new URL("../../scripts/capture-ios-build-evidence.cjs", import.meta.url)),
    );
    writeFileSync(
      join(f.root, "map-input.json"),
      readFileSync(join(f.root, ".build-evidence/ios.map")),
    );
    rmSync(join(f.root, ".build-evidence/ios.map"));
    const script = require("../../plugins/with-ios-build-evidence.cjs").decorateBundlePhase(
      ': react-native-xcode.sh\nif [ -n "${SOURCEMAP_FILE:-}" ]; then cp "$PROJECT_DIR/../map-input.json" "$SOURCEMAP_FILE"; fi\n',
    );
    const { execFileSync } = require("node:child_process");
    execFileSync("/bin/bash", ["-c", script], {
      env: {
        ...process.env,
        ...f.env,
        NODE_BINARY: process.execPath,
        CONFIGURATION: configuration,
        IRON_CAPTURE_IOS_BUILD_EVIDENCE: enabled,
      },
    });
    expect(existsSync(join(f.root, ".build-evidence/ios-proof.json"))).toBe(expected);
  },
);
it("una fase fallida no captura un producto aunque haya generado un mapa válido", () => {
  const f = fixture();
  mkdirSync(join(f.root, "scripts"));
  writeFileSync(
    join(f.root, "scripts/capture-ios-build-evidence.cjs"),
    readFileSync(new URL("../../scripts/capture-ios-build-evidence.cjs", import.meta.url)),
  );
  writeFileSync(
    join(f.root, "map-input.json"),
    readFileSync(join(f.root, ".build-evidence/ios.map")),
  );
  rmSync(join(f.root, ".build-evidence/ios.map"));
  const script = require("../../plugins/with-ios-build-evidence.cjs").decorateBundlePhase(
    'cp "$PROJECT_DIR/../map-input.json" "$SOURCEMAP_FILE"\nfalse # react-native-xcode.sh\n',
  );
  const { execFileSync } = require("node:child_process");
  expect(() =>
    execFileSync("/bin/bash", ["-c", script], {
      env: {
        ...process.env,
        ...f.env,
        NODE_BINARY: process.execPath,
        CONFIGURATION: "Release",
        IRON_CAPTURE_IOS_BUILD_EVIDENCE: "1",
      },
    }),
  ).toThrow();
  expect(existsSync(join(f.root, ".build-evidence/ios.map"))).toBe(true);
  expect(existsSync(join(f.root, ".build-evidence/ios-proof.json"))).toBe(false);
});
it("la fase rechaza un mapa de otro intento antes de ejecutar el empaquetado", () => {
  const f = fixture();
  const original = readFileSync(join(f.root, ".build-evidence/ios.map"));
  const script = require("../../plugins/with-ios-build-evidence.cjs").decorateBundlePhase(
    'touch "$PROJECT_DIR/../started" # react-native-xcode.sh\n',
  );
  const { execFileSync } = require("node:child_process");
  expect(() =>
    execFileSync("/bin/bash", ["-c", script], {
      env: {
        ...process.env,
        ...f.env,
        CONFIGURATION: "Release",
        IRON_CAPTURE_IOS_BUILD_EVIDENCE: "1",
      },
    }),
  ).toThrow();
  expect(existsSync(join(f.root, "started"))).toBe(false);
  expect(readFileSync(join(f.root, ".build-evidence/ios.map"))).toEqual(original);
});
it.each([
  ["Debug", "1"],
  ["Release", "0"],
])(
  "conserva el tratamiento de errores del script original en %s con captura %s",
  (configuration, enabled) => {
    const script = require("../../plugins/with-ios-build-evidence.cjs").decorateBundlePhase(
      "false # react-native-xcode.sh\ntrue\n",
    );
    const { execFileSync } = require("node:child_process");
    expect(() =>
      execFileSync("/bin/bash", ["-c", script], {
        env: {
          ...process.env,
          CONFIGURATION: configuration,
          IRON_CAPTURE_IOS_BUILD_EVIDENCE: enabled,
        },
      }),
    ).not.toThrow();
  },
);
