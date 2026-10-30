const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { redactQualityOutput, summarizeNativeStorage } = require("./run-ios-quality.cjs");
const TARGET = Object.freeze({
  appId: "com.domarchis.ironstrength.quality",
  version: "0.1.0",
  buildNumber: "8",
  buildId: "70774fb1-e41e-4e7c-9b87-97369911900a",
  sourceCommit: "c3505b00302ef23d1c7cb00eeda81e6ee3af1d26",
  bundleSha256: "e90bd3593e311e39d759e2236485dcbaf08de4ff32517645a7abd9c66e78800b",
  mapSha256: "6b190eadb2521896b8e95e8c8b66eafad0de386ce1f35f4c03219bf247f764c7",
  apiOrigin: "https://manufacturer-academic-contractor-shades.trycloudflare.com",
  backendOrigin: "https://deals-terrorists-ads-dos.trycloudflare.com",
  backendBuildId: "aef39df9649f4da68845dd9290e81629",
});
const MAESTRO_SHA = "5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a";
const NAMES = ["home-dark", "workout", "progress", "home-light"];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function readCaptureInputs(env) {
  if (
    env.IOS_CAPTURE_API_ORIGIN !== TARGET.apiOrigin ||
    env.IOS_CAPTURE_BACKEND_ORIGIN !== TARGET.backendOrigin ||
    env.IOS_CAPTURE_BACKEND_BUILD_ID !== TARGET.backendBuildId ||
    !uuid.test(env.IOS_CAPTURE_ACCOUNT_ID ?? "") ||
    !/^[a-z0-9._+-]+@iron-strength(?:\.e2e)?\.test$/.test(env.IRON_IOS_CAPTURE_EMAIL ?? "") ||
    typeof env.IRON_IOS_CAPTURE_PASSWORD !== "string" ||
    env.IRON_IOS_CAPTURE_PASSWORD.length < 8 ||
    env.IRON_IOS_CAPTURE_PASSWORD.length > 200 ||
    /[\r\n\0]/.test(env.IRON_IOS_CAPTURE_PASSWORD)
  )
    throw new Error("invalid_isolated_capture_inputs");
  return {
    accountId: env.IOS_CAPTURE_ACCOUNT_ID,
    email: env.IRON_IOS_CAPTURE_EMAIL,
    password: env.IRON_IOS_CAPTURE_PASSWORD,
  };
}
function verifyCaptureTarget(info, bundle, expected = TARGET.bundleSha256) {
  if (
    info?.CFBundleIdentifier !== TARGET.appId ||
    info.CFBundleVersion !== TARGET.buildNumber ||
    info.CFBundleShortVersionString !== TARGET.version ||
    info.CFBundleExecutable !== "IronStrengthPruebas" ||
    JSON.stringify(info.CFBundleSupportedPlatforms) !== '["iPhoneSimulator"]' ||
    !/^[a-f0-9]{64}$/.test(expected ?? "") ||
    bundle.subarray(0, 8).toString("hex") !== "c61fbc03c103191f" ||
    sha(bundle) !== expected
  )
    throw new Error("unexpected_capture_application");
  return {
    appId: TARGET.appId,
    buildNumber: TARGET.buildNumber,
    bundleSha256: sha(bundle),
    executable: info.CFBundleExecutable,
  };
}
function chooseCaptureTemplate(list, catalog) {
  const models = [
    "iPhone Air",
    "iPhone 18 Pro Max",
    "iPhone 17 Pro Max",
    "iPhone 16 Pro Max",
    "iPhone 15 Pro Max",
    "iPhone 14 Pro Max",
  ];
  const candidates = [];
  for (const runtime of catalog.runtimes ?? []) {
    const match = /^com\.apple\.CoreSimulator\.SimRuntime\.iOS-(\d+)-(\d+)(?:-\d+)?$/.exec(
      runtime.identifier ?? "",
    );
    if (
      !runtime.isAvailable ||
      !match ||
      Number(match[1]) < 16 ||
      (Number(match[1]) === 16 && Number(match[2]) < 4)
    )
      continue;
    const types = [
      ...(runtime.supportedDeviceTypes ?? []),
      ...(list.devices?.[runtime.identifier] ?? [])
        .filter((d) => d.isAvailable)
        .map((d) => ({ name: d.name, identifier: d.deviceTypeIdentifier })),
    ];
    for (const type of types) {
      const index = models.indexOf(type.name);
      if (
        index < 0 ||
        type.identifier !==
          "com.apple.CoreSimulator.SimDeviceType." + type.name.replaceAll(" ", "-")
      )
        continue;
      candidates.push({
        name: type.name,
        deviceType: type.identifier,
        runtime: runtime.identifier,
        score: (models.length - index) * 100000 + Number(match[1]) * 100 + Number(match[2]),
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) throw new Error("no_available_portrait_capture_template");
  const { name, deviceType, runtime } = candidates[0];
  return { name, deviceType, runtime };
}
function verifyCaptureSequence(captures) {
  if (
    !Array.isArray(captures) ||
    captures.length !== NAMES.length ||
    captures.some(
      (v, i) =>
        v?.name !== NAMES[i] + ".png" ||
        !/^[a-f0-9]{64}$/.test(v.sha256 ?? "") ||
        !Number.isInteger(v.bytes) ||
        v.bytes < 10000 ||
        ![
          [1260, 2736],
          [1290, 2796],
          [1320, 2868],
        ].some(([width, height]) => v.width === width && v.height === height),
    ) ||
    new Set(captures.map((v) => v.sha256)).size !== NAMES.length
  )
    throw new Error("invalid_native_capture_sequence");
  return true;
}
function captureFlow(name) {
  const marginSwipe =
    '- swipe:\n    start: "10%, 80%"\n    end: "10%, 25%"\n    duration: 600\n    waitToSettleTimeoutMs: 500\n';
  const flows = {
    login:
      '- launchApp:\n    clearState: false\n    clearKeychain: false\n    stopApp: false\n- extendedWaitUntil:\n    visible: "Inicia sesión"\n    timeout: 30000\n- tapOn:\n    text: "Correo"\n    height: 50\n    tolerance: 3\n- inputText:\n    text: ${QA_EMAIL}\n    label: Correo ficticio de captura\n- pressKey: Enter\n- tapOn: "Mostrar contraseña"\n- tapOn:\n    text: "Contraseña"\n    height: 50\n    tolerance: 3\n- inputText:\n    text: ${QA_PASSWORD}\n    label: Clave ficticia de captura\n- tapOn: "Ocultar contraseña"\n- pressKey: Enter\n- extendedWaitUntil:\n    visible: "Save Password.*|Hola, Gabriel"\n    timeout: 30000\n- runFlow:\n    when:\n      visible: "Save Password.*"\n    commands:\n      - tapOn: "Not Now"\n- extendedWaitUntil:\n    visible: "Hola, Gabriel"\n    timeout: 30000\n',
    "home-dark":
      '- tapOn: "Cuenta, tab,.*"\n- tapOn: "Oscuro"\n- tapOn: "Inicio, tab,.*"\n- assertVisible: "Hola, Gabriel"\n- assertVisible: "Ver rutina C"\n',
    workout:
      '- tapOn: "Ver rutina C"\n- tapOn: "Empezar entrenamiento"\n- extendedWaitUntil:\n    visible: "Hip thrust"\n    timeout: 30000\n- tapOn: "KG serie 1"\n- eraseText\n- inputText: "40"\n- tapOn: "REPS serie 1"\n- eraseText\n- inputText: "10"\n- tapOn: "Completar serie 1"\n- hideKeyboard\n- assertVisible: "1/3"\n- assertVisible: "Guardado en este dispositivo"\n',
    discard:
      marginSwipe +
      '- assertVisible: "Descartar registro local"\n- tapOn: "Descartar registro local"\n' +
      marginSwipe +
      '- tapOn: "Confirmar descarte"\n- assertVisible: "Hola, Gabriel"\n',
    progress:
      '- tapOn: "Progreso, tab,.*"\n- tapOn: "Ver progreso de Curl femoral · Registro anterior"\n- tapOn: "12 semanas"\n- tapOn: "Volumen"\n- assertVisible: "Curl femoral"\n- assertVisible: "675 kg"\n',
    "home-light":
      '- scrollUntilVisible:\n    element:\n      text: "Volver a mis ejercicios"\n    direction: DOWN\n- tapOn: "Volver a mis ejercicios"\n- tapOn: "Cuenta, tab,.*"\n- tapOn: "Claro"\n- tapOn: "Inicio, tab,.*"\n- assertVisible: "Hola, Gabriel"\n- assertVisible: "Ver rutina C"\n',
  };
  if (!Object.hasOwn(flows, name)) throw new Error("unexpected_capture_flow");
  return flows[name];
}
async function run() {
  if (process.platform !== "darwin") throw new Error("ios_capture_requires_macos");
  process.umask(0o077);
  const input = readCaptureInputs(process.env),
    out = path.resolve(".ios-quality-evidence/store-captures"),
    raw = path.resolve(".ios-quality-raw/store-captures"),
    tools = path.resolve(".ios-quality-tools");
  for (const dir of [out, raw, tools]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 900000;
  const report = {
    version: 1,
    buildId: TARGET.buildId,
    artifactSourceCommit: TARGET.sourceCommit,
    mapSha256: TARGET.mapSha256,
    startedAt: new Date().toISOString(),
    appIdentityVerified: false,
    backendBuildVerified: false,
    accountVerified: false,
    nativeCaptureAssertionsPassed: false,
    uiContentVerified: false,
    physicalAcceptance: false,
    productionCandidate: false,
    screenshots: [],
    snapshots: [],
    captureDraftDiscarded: false,
    remoteResultStatuses: [],
    cleanupComplete: false,
  };
  let owned = null,
    accessToken = null,
    maestro = null;
  const scrub = (v) => redactQualityOutput(v, [input.email, input.password, accessToken]);
  const save = () =>
    fs.writeFileSync(path.join(out, "proof.json"), JSON.stringify(report, null, 2) + "\n", {
      mode: 0o600,
    });
  function command(file, args, timeout = 30000, env = process.env) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("ios_capture_deadline");
    const p = spawnSync(file, args, {
      encoding: "utf8",
      timeout: Math.min(timeout, remaining),
      maxBuffer: 16 * 1024 * 1024,
      env,
    });
    if (p.error || p.status !== 0) {
      fs.writeFileSync(
        path.join(out, "command-error.txt"),
        scrub(p.stdout + "\n" + p.stderr + "\n" + (p.error?.message ?? "")),
        { mode: 0o600 },
      );
      throw new Error("capture_command_failed:" + path.basename(file) + ":" + args[0]);
    }
    return p.stdout.trim();
  }
  async function request(route, body) {
    const response = await fetch(TARGET.apiOrigin + "/api/mobile/v1/" + route, {
      method: body ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(25000),
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: "Bearer " + accessToken } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return response;
  }
  function flow(name, content) {
    if (!/^[a-z-]+$/.test(name)) throw new Error("invalid_capture_flow_name");
    const file = path.join(raw, name + ".yaml"),
      debug = path.join(raw, name);
    fs.writeFileSync(file, "appId: " + TARGET.appId + "\nname: " + name + "\n---\n" + content, {
      mode: 0o600,
    });
    const env = {
      ...process.env,
      CI: "true",
      MAESTRO_CLI_NO_ANALYTICS: "true",
      MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: "true",
      MAESTRO_DISABLE_UPDATE_CHECK: "true",
    };
    const result = spawnSync(
      maestro,
      [
        "--udid",
        owned,
        "test",
        "--no-ansi",
        "--test-output-dir",
        debug,
        "--debug-output",
        path.join(debug, "debug"),
        "--format",
        "JUNIT",
        "--output",
        path.join(debug, "report.xml"),
        "-e",
        "QA_EMAIL=" + input.email,
        "-e",
        "QA_PASSWORD=" + input.password,
        file,
      ],
      {
        encoding: "utf8",
        timeout: Math.min(210000, deadline - Date.now()),
        maxBuffer: 16 * 1024 * 1024,
        env,
      },
    );
    fs.writeFileSync(path.join(out, name + ".log"), scrub(result.stdout + "\n" + result.stderr), {
      mode: 0o600,
    });
    const junit = path.join(debug, "report.xml");
    if (fs.existsSync(junit))
      fs.writeFileSync(path.join(out, name + ".xml"), scrub(fs.readFileSync(junit, "utf8")), {
        mode: 0o600,
      });
    if (result.error || result.status !== 0) {
      const tree = spawnSync(maestro, ["--udid", owned, "hierarchy"], {
        encoding: "utf8",
        timeout: 20000,
        maxBuffer: 4 * 1024 * 1024,
        env,
      });
      fs.writeFileSync(
        path.join(out, name + "-hierarchy.txt"),
        scrub(tree.stdout + "\n" + tree.stderr),
        { mode: 0o600 },
      );
      throw new Error("native_capture_flow_failed:" + name);
    }
  }
  function screenshot(name) {
    if (!NAMES.includes(name)) throw new Error("invalid_capture_name");
    const expected = name.startsWith("home-")
      ? "Hola, Gabriel"
      : name === "workout"
        ? "Hip thrust"
        : "Curl femoral";
    flow(
      "capture-" + name,
      '- assertVisible: "' + expected + '"\n- takeScreenshot: ' + name + "\n",
    );
    const matches = [];
    function visit(dir, depth) {
      if (depth > 7) return;
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.isSymbolicLink()) continue;
        const p = path.join(dir, item.name);
        if (item.isDirectory()) visit(p, depth + 1);
        else if (item.isFile() && item.name === name + ".png") matches.push(p);
      }
    }
    visit(path.join(raw, "capture-" + name), 0);
    if (matches.length !== 1) throw new Error("explicit_capture_not_unique");
    const bytes = fs.readFileSync(matches[0]);
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.length < 10000)
      throw new Error("invalid_capture_png");
    fs.writeFileSync(path.join(out, name + ".png"), bytes, { mode: 0o600 });
    report.screenshots.push({
      name: name + ".png",
      method: "maestro-takeScreenshot",
      sha256: sha(bytes),
      bytes: bytes.length,
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    });
    save();
  }
  function storage(name) {
    const container = fs.realpathSync(
      command("xcrun", ["simctl", "get_app_container", owned, TARGET.appId, "data"]),
    );
    if (!container.toLowerCase().includes(owned.toLowerCase()))
      throw new Error("unexpected_capture_container");
    const found = [];
    function visit(dir, depth) {
      if (depth > 6) return;
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.isSymbolicLink()) continue;
        const p = path.join(dir, item.name);
        if (item.isDirectory()) visit(p, depth + 1);
        else if (item.isFile() && item.name === "ExpoSQLiteStorage") found.push(p);
      }
    }
    visit(container, 0);
    if (found.length !== 1) throw new Error("capture_sqlite_not_unique");
    const keys = [
      "is:native-training:v1:" + input.accountId,
      "is:native-sync:v1:" + input.accountId,
    ];
    const rows = JSON.parse(
      command("sqlite3", [
        "-readonly",
        "-json",
        found[0],
        "SELECT key,value FROM storage WHERE key IN ('" + keys.join("','") + "');",
      ]),
    );
    const values = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const snapshot = summarizeNativeStorage(values[keys[0]], values[keys[1]], input.accountId);
    report.snapshots.push({ name, ...snapshot });
    save();
    return snapshot;
  }
  try {
    report.harnessSourceCommit = command("git", ["rev-parse", "HEAD"]);
    if (!/^[a-f0-9]{40}$/.test(report.harnessSourceCommit))
      throw new Error("invalid_capture_harness_source");
    const app = fs.realpathSync(process.env.IOS_CAPTURE_APP_PATH ?? "");
    if (!app.endsWith(".app")) throw new Error("expected_capture_app");
    const info = JSON.parse(
      command("plutil", ["-convert", "json", "-o", "-", path.join(app, "Info.plist")]),
    );
    const bundle = fs.readFileSync(path.join(app, "main.jsbundle"));
    report.target = verifyCaptureTarget(info, bundle);
    if (
      (fs.statSync(path.join(app, "main.jsbundle")).mode & 0o777) !== 0o644 ||
      !bundle.includes(Buffer.from(TARGET.apiOrigin))
    )
      throw new Error("unexpected_capture_bundle");
    report.appIdentityVerified = true;
    save();
    const backend = await fetch(TARGET.backendOrigin + "/login", {
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
    if (!backend.ok || !(await backend.text()).includes(TARGET.backendBuildId))
      throw new Error("capture_backend_changed");
    report.backendBuildVerified = true;
    const response = await request("auth/login", { email: input.email, password: input.password });
    if (!response.ok) throw new Error("capture_login_status_" + response.status);
    const login = await response.json();
    if (login.profile?.id !== input.accountId || typeof login.accessToken !== "string")
      throw new Error("capture_account_changed");
    accessToken = login.accessToken;
    report.accountVerified = true;
    save();
    const zip = path.join(tools, "maestro-store.zip");
    command(
      "curl",
      [
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--max-time",
        "120",
        "--output",
        zip,
        "https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.11.0/maestro.zip",
      ],
      125000,
    );
    if (sha(fs.readFileSync(zip)) !== MAESTRO_SHA) throw new Error("maestro_archive_hash_mismatch");
    command("ditto", ["-x", "-k", zip, tools], 60000);
    maestro = path.join(tools, "maestro/bin/maestro");
    report.maestro = { version: "2.11.0", archiveSha256: MAESTRO_SHA };
    report.toolchain = command("xcodebuild", ["-version"]);
    report.template = chooseCaptureTemplate(
      JSON.parse(command("xcrun", ["simctl", "list", "devices", "available", "--json"])),
      JSON.parse(command("xcrun", ["simctl", "list", "runtimes", "--json"])),
    );
    owned = command("xcrun", [
      "simctl",
      "create",
      "IronStrength-Store-" + randomUUID().slice(0, 8),
      report.template.deviceType,
      report.template.runtime,
    ]);
    if (!uuid.test(owned)) {
      owned = null;
      throw new Error("invalid_created_capture_simulator");
    }
    report.ownedSimulator = owned;
    save();
    command("xcrun", ["simctl", "boot", owned]);
    command("xcrun", ["simctl", "bootstatus", owned, "-b"], 120000);
    command("xcrun", ["simctl", "install", owned, app], 60000);
    command("xcrun", ["simctl", "ui", owned, "appearance", "dark"]);
    const launch = command("xcrun", ["simctl", "launch", owned, TARGET.appId]);
    const match = /^com\.domarchis\.ironstrength\.quality:\s*(\d+)$/.exec(launch);
    if (!match) throw new Error("invalid_capture_launch_pid");
    process.kill(Number(match[1]), 0);
    flow("login", captureFlow("login"));
    flow("home-dark", captureFlow("home-dark"));
    screenshot("home-dark");
    flow("workout", captureFlow("workout"));
    screenshot("workout");
    const local = storage("workout-captured");
    if (
      !local.active ||
      local.active.completedSets !== 1 ||
      local.active.firstSet?.weight !== "40" ||
      local.active.firstSet?.reps !== "10" ||
      local.active.firstSet?.done !== true ||
      local.entries.length !== 0 ||
      !local.active.restEndsAt
    )
      throw new Error("capture_draft_not_saved");
    flow("discard", captureFlow("discard"));
    const discarded = storage("discarded");
    if (discarded.active !== null || discarded.entries.length !== 0)
      throw new Error("capture_draft_not_discarded");
    report.captureDraftDiscarded = true;
    for (const endpoint of ["typed-recordings/", "workouts/"]) {
      const result = await request(endpoint + local.active.workoutId);
      report.remoteResultStatuses.push(result.status);
      if (result.status !== 404) throw new Error("unexpected_remote_capture_result");
    }
    flow("progress", captureFlow("progress"));
    screenshot("progress");
    flow("home-light", captureFlow("home-light"));
    screenshot("home-light");
    report.captureSequenceVerified = verifyCaptureSequence(report.screenshots);
    report.nativeCaptureAssertionsPassed = true;
  } catch (error) {
    report.error = scrub(error.message);
  } finally {
    if (owned) {
      const a = spawnSync("xcrun", ["simctl", "shutdown", owned], { timeout: 20000 });
      const b = spawnSync("xcrun", ["simctl", "delete", owned], { timeout: 20000 });
      report.cleanupComplete = a.status === 0 && b.status === 0;
    }
    report.finishedAt = new Date().toISOString();
    save();
    for (const item of fs.readdirSync(out))
      if (/\.(json|log|xml|txt)$/.test(item)) {
        const p = path.join(out, item);
        fs.writeFileSync(p, scrub(fs.readFileSync(p, "utf8")), { mode: 0o600 });
      }
  }
  console.log(
    JSON.stringify({
      nativeCaptureAssertionsPassed: report.nativeCaptureAssertionsPassed,
      screenshots: report.screenshots.length,
      captureDraftDiscarded: report.captureDraftDiscarded,
      cleanupComplete: report.cleanupComplete,
      uiReviewRequired: true,
    }),
  );
  if (!report.nativeCaptureAssertionsPassed || !report.cleanupComplete) process.exitCode = 1;
}
module.exports = {
  TARGET,
  readCaptureInputs,
  verifyCaptureTarget,
  chooseCaptureTemplate,
  verifyCaptureSequence,
  captureFlow,
};
if (require.main === module)
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
