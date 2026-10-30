const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { chooseSimulatorTemplate } = require("./smoke-ios-simulator.cjs");
const APP_ID = "com.domarchis.ironstrength.quality";
const MAESTRO_SHA = "5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function redactQualityOutput(text, secrets) {
  let result = String(text);
  for (const value of secrets) {
    if (typeof value !== "string" || !value) continue;
    const xml = value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
    for (const encoded of new Set([JSON.stringify(value).slice(1, -1), xml, value]))
      result = result.split(encoded).join("[redacted]");
  }
  return result.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt-redacted]");
}
function readQualityInputs(env) {
  const api = new URL(env.IOS_QUALITY_API_ORIGIN);
  if (
    api.protocol !== "https:" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(api.hostname) ||
    api.username ||
    api.password ||
    api.port ||
    api.pathname !== "/" ||
    api.search ||
    api.hash ||
    !uuid.test(env.IOS_QUALITY_BUILD_ID ?? "") ||
    !uuid.test(env.IOS_QUALITY_ACCOUNT_ID ?? "") ||
    !/^[a-f0-9]{40}$/.test(env.IOS_QUALITY_SOURCE_COMMIT ?? "") ||
    !/^[a-f0-9]{64}$/.test(env.IOS_QUALITY_BUNDLE_SHA256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(env.IRON_IOS_QUALITY_PROXY_TOKEN ?? "") ||
    !/^[a-zA-Z0-9_-]{10,100}$/.test(env.IOS_QUALITY_BACKEND_BUILD_ID ?? "") ||
    !/^[a-z0-9._+-]+@iron-strength\.e2e\.test$/.test(env.IRON_IOS_QUALITY_TEST_EMAIL ?? "") ||
    typeof env.IRON_IOS_QUALITY_TEST_PASSWORD !== "string" ||
    env.IRON_IOS_QUALITY_TEST_PASSWORD.length < 8 ||
    env.IRON_IOS_QUALITY_TEST_PASSWORD.length > 200
  )
    throw new Error("invalid_isolated_quality_inputs");
  return {
    apiOrigin: api.origin,
    buildId: env.IOS_QUALITY_BUILD_ID,
    accountId: env.IOS_QUALITY_ACCOUNT_ID,
    sourceCommit: env.IOS_QUALITY_SOURCE_COMMIT,
    bundleSha256: env.IOS_QUALITY_BUNDLE_SHA256,
    backendBuildId: env.IOS_QUALITY_BACKEND_BUILD_ID,
    email: env.IRON_IOS_QUALITY_TEST_EMAIL,
    password: env.IRON_IOS_QUALITY_TEST_PASSWORD,
    controlToken: env.IRON_IOS_QUALITY_PROXY_TOKEN,
  };
}
function verifyQualitySimulator(info, bundle, expectedHash) {
  if (
    info?.CFBundleIdentifier !== APP_ID ||
    info.CFBundleVersion !== "7" ||
    info.CFBundleShortVersionString !== "0.1.0" ||
    info.CFBundleExecutable !== "IronStrengthPruebas" ||
    JSON.stringify(info.CFBundleSupportedPlatforms) !== '["iPhoneSimulator"]' ||
    !/^[a-f0-9]{64}$/.test(expectedHash ?? "") ||
    bundle.subarray(0, 8).toString("hex") !== "c61fbc03c103191f" ||
    sha(bundle) !== expectedHash
  )
    throw new Error("unexpected_quality_simulator");
  return { appId: APP_ID, buildNumber: "7", bundleSha256: sha(bundle) };
}
function summarizeNativeStorage(trainingRaw, queueRaw, userId) {
  if (!uuid.test(userId)) throw new Error("invalid_storage_account");
  const training = trainingRaw ? JSON.parse(trainingRaw) : null;
  const queue = queueRaw ? JSON.parse(queueRaw) : null;
  if (training && (training.userId !== userId || ![1, 2, 3, 4].includes(training.version)))
    throw new Error("unexpected_training_storage");
  if (
    queue &&
    (queue.userId !== userId || ![1, 2, 3].includes(queue.version) || !Array.isArray(queue.entries))
  )
    throw new Error("unexpected_queue_storage");
  const active = training?.active,
    d = active?.draft;
  if (d && (!uuid.test(d.workoutId) || !Array.isArray(d.exercises)))
    throw new Error("invalid_native_draft");
  return {
    active: d
      ? {
          workoutId: d.workoutId,
          activeIndex: active.activeIndex,
          completedSets: d.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0),
          firstSet: d.exercises[0]?.sets[0]
            ? {
                weight: d.exercises[0].sets[0].weight,
                reps: d.exercises[0].sets[0].reps,
                done: d.exercises[0].sets[0].done,
              }
            : null,
          restEndsAt: d.rest?.endsAt ?? null,
        }
      : null,
    entries: (queue?.entries ?? []).map((e) => {
      if (
        !uuid.test(e.payload?.id ?? "") ||
        ![1, 2, 3].includes(e.payload?.version) ||
        !["pending", "confirmed"].includes(e.phase)
      )
        throw new Error("invalid_native_queue_entry");
      return {
        workoutId: e.payload.id,
        payloadVersion: e.payload.version,
        phase: e.phase,
        payloadSha256: sha(JSON.stringify(e.payload)),
        setCount: (e.payload.workout ?? e.payload).sets.length,
      };
    }),
  };
}
function qualityResultRoute(entry) {
  if (!uuid.test(entry?.workoutId ?? "") || ![1, 2, 3].includes(entry?.payloadVersion))
    throw new Error("unknown_quality_result_contract");
  return (
    "/api/mobile/v1/" +
    (entry.payloadVersion === 3 ? "typed-recordings/" : "workouts/") +
    entry.workoutId
  );
}
function verifyQualityResult(result, entry) {
  qualityResultRoute(entry);
  const sets = result.workout?.exercises?.flatMap((e) => e.sets) ?? [];
  const metrics = sets.map((s) => (entry.payloadVersion === 3 ? s.metrics : s));
  if (
    result.workout?.id !== entry.workoutId ||
    metrics.length !== 2 ||
    metrics[0]?.weightKg !== 30 ||
    metrics[0]?.reps !== 8 ||
    metrics[1]?.weightKg !== 32 ||
    metrics[1]?.reps !== 9
  )
    throw new Error("authenticated_result_does_not_match_native_sets");
  return sets.length;
}
async function run() {
  if (process.platform !== "darwin") throw new Error("ios_quality_requires_macos");
  const input = readQualityInputs(process.env);
  const out = path.resolve(".ios-quality-evidence"),
    raw = path.resolve(".ios-quality-raw");
  fs.mkdirSync(out, { mode: 0o700 });
  fs.mkdirSync(raw, { mode: 0o700 });
  const deadline = Date.now() + 720_000;
  const report = {
    version: 1,
    buildId: input.buildId,
    artifactSourceCommit: input.sourceCommit,
    startedAt: new Date().toISOString(),
    appIdentityVerified: false,
    nativeCircuitPassed: false,
    uiContentVerified: false,
    physicalAcceptance: false,
    snapshots: [],
    screenshots: [],
    cleanupComplete: false,
    proxyRestored: false,
  };
  let owned = null,
    accessToken = null,
    maestro = null;
  const scrub = (text) =>
    redactQualityOutput(text, [input.email, input.password, input.controlToken, accessToken]);
  const save = () =>
    fs.writeFileSync(path.join(out, "proof.json"), JSON.stringify(report, null, 2) + "\n", {
      mode: 0o600,
    });
  function command(file, args, timeout = 30_000, env = process.env) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("ios_quality_deadline");
    const result = spawnSync(file, args, {
      encoding: "utf8",
      timeout: Math.min(timeout, remaining),
      maxBuffer: 16 * 1024 * 1024,
      env,
    });
    if (result.status !== 0 || result.error) {
      fs.writeFileSync(
        path.join(out, "command-error.txt"),
        scrub(result.stdout + "\n" + result.stderr + "\n" + (result.error?.message ?? "")),
        { mode: 0o600 },
      );
      throw new Error("command_failed:" + path.basename(file) + ":" + args[0]);
    }
    return result.stdout.trim();
  }
  async function request(route, { token, body, control = false } = {}) {
    const r = await fetch(input.apiOrigin + route, {
      method: body === undefined ? "GET" : "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(control ? { Authorization: "Bearer " + input.controlToken } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!r.ok) throw new Error("quality_request_status_" + r.status);
    return r.json();
  }
  async function control(body) {
    const result = await request("/__quality/control", { body, control: true });
    if (!result.ok) throw new Error("quality_control_rejected");
  }
  function screenshot(name) {
    const p = path.join(out, name + ".png");
    const captureName = "capture-" + name;
    flow(captureName, "- takeScreenshot: " + name + "\n");
    const matches = [];
    function find(dir, depth) {
      if (depth > 7) return;
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.isSymbolicLink()) continue;
        const file = path.join(dir, item.name);
        if (item.isDirectory()) find(file, depth + 1);
        else if (item.isFile() && item.name === name + ".png") matches.push(file);
      }
    }
    find(path.join(raw, captureName), 0);
    if (matches.length !== 1) throw new Error("explicit_native_capture_not_unique");
    fs.copyFileSync(matches[0], p);
    const bytes = fs.readFileSync(p);
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
      throw new Error("invalid_screenshot");
    fs.chmodSync(p, 0o600);
    report.screenshots.push({
      name: name + ".png",
      method: "maestro-takeScreenshot",
      bytes: bytes.length,
      sha256: sha(bytes),
    });
    save();
  }
  function storage(name) {
    const container = fs.realpathSync(
      command("xcrun", ["simctl", "get_app_container", owned, APP_ID, "data"]),
    );
    if (!container.toLowerCase().includes(owned.toLowerCase()))
      throw new Error("unexpected_app_container");
    const matches = [];
    function visit(dir, depth) {
      if (depth > 6) return;
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.isSymbolicLink()) continue;
        const p = path.join(dir, item.name);
        if (item.isDirectory()) visit(p, depth + 1);
        else if (item.isFile() && item.name === "ExpoSQLiteStorage") matches.push(p);
      }
    }
    visit(container, 0);
    if (matches.length !== 1) throw new Error("native_sqlite_store_not_unique");
    const keys = [
      "is:native-training:v1:" + input.accountId,
      "is:native-sync:v1:" + input.accountId,
    ];
    const rows = JSON.parse(
      command("sqlite3", [
        "-readonly",
        "-json",
        matches[0],
        "SELECT key,value FROM storage WHERE key IN ('" + keys.join("','") + "');",
      ]),
    );
    const values = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const projection = summarizeNativeStorage(values[keys[0]], values[keys[1]], input.accountId);
    report.snapshots.push({ name, ...projection });
    save();
    return projection;
  }
  function flow(name, content) {
    const file = path.join(raw, name + ".yaml"),
      debug = path.join(raw, name);
    fs.writeFileSync(file, "appId: " + APP_ID + "\nname: " + name + "\n---\n" + content, {
      mode: 0o600,
    });
    const env = {
      ...process.env,
      CI: "true",
      MAESTRO_CLI_NO_ANALYTICS: "true",
      MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: "true",
      MAESTRO_DISABLE_UPDATE_CHECK: "true",
    };
    const args = [
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
      "-e",
      "QA_TITLE=QA iOS " + input.buildId.slice(0, 8),
      file,
    ];
    const result = spawnSync(maestro, args, {
      encoding: "utf8",
      timeout: Math.min(210_000, deadline - Date.now()),
      maxBuffer: 16 * 1024 * 1024,
      env,
    });
    fs.writeFileSync(path.join(out, name + ".log"), scrub(result.stdout + "\n" + result.stderr), {
      mode: 0o600,
    });
    const junit = path.join(debug, "report.xml");
    if (fs.existsSync(junit))
      fs.writeFileSync(path.join(out, name + ".xml"), scrub(fs.readFileSync(junit, "utf8")), {
        mode: 0o600,
      });
    if (result.error || result.status !== 0) {
      const hierarchy = spawnSync(maestro, ["--udid", owned, "hierarchy"], {
        encoding: "utf8",
        timeout: 20_000,
        maxBuffer: 4 * 1024 * 1024,
        env,
      });
      fs.writeFileSync(
        path.join(out, name + "-hierarchy.txt"),
        scrub(hierarchy.stdout + "\n" + hierarchy.stderr),
        { mode: 0o600 },
      );
      const text = [];
      let total = 0;
      function collect(dir, depth) {
        if (depth > 5 || !fs.existsSync(dir) || text.length >= 24) return;
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
          if (item.isSymbolicLink()) continue;
          const file = path.join(dir, item.name);
          if (item.isDirectory()) collect(file, depth + 1);
          else if (item.isFile() && /\.(json|xml|log|txt)$/.test(item.name)) {
            const size = fs.statSync(file).size;
            if (size > 1024 * 1024 || total + size > 4 * 1024 * 1024 || text.length >= 24) continue;
            total += size;
            text.push({
              file: path.relative(debug, file),
              content: scrub(fs.readFileSync(file, "utf8")),
            });
          }
        }
      }
      collect(debug, 0);
      fs.writeFileSync(
        path.join(out, name + "-diagnostics.json"),
        JSON.stringify(text, null, 2) + "\n",
        { mode: 0o600 },
      );
      throw new Error("native_flow_failed:" + name);
    }
  }
  try {
    report.harnessSourceCommit = command("git", ["rev-parse", "HEAD"]);
    if (!/^[a-f0-9]{40}$/.test(report.harnessSourceCommit))
      throw new Error("invalid_harness_source");
    const app = fs.realpathSync(process.env.IOS_QUALITY_APP_PATH ?? "");
    if (!app.endsWith(".app")) throw new Error("expected_quality_app");
    const info = JSON.parse(
      command("plutil", ["-convert", "json", "-o", "-", path.join(app, "Info.plist")]),
    );
    report.target = verifyQualitySimulator(
      info,
      fs.readFileSync(path.join(app, "main.jsbundle")),
      input.bundleSha256,
    );
    if ((fs.statSync(path.join(app, "main.jsbundle")).mode & 0o777) !== 0o644)
      throw new Error("unexpected_bundle_permissions");
    report.appIdentityVerified = true;
    const status = await request("/__quality/status");
    if (!status.qualityOnly || status.buildId !== input.backendBuildId)
      throw new Error("quality_backend_changed");
    const login = await request("/api/mobile/v1/auth/login", {
      body: { email: input.email, password: input.password },
    });
    if (login.profile?.id !== input.accountId) throw new Error("quality_account_changed");
    accessToken = login.accessToken;
    await control({ cutApi: false, dropNextCreated: false });
    const tools = path.resolve(".ios-quality-tools");
    fs.mkdirSync(tools, { mode: 0o700 });
    const zip = path.join(tools, "maestro.zip");
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
      125_000,
    );
    if (sha(fs.readFileSync(zip)) !== MAESTRO_SHA) throw new Error("maestro_archive_hash_mismatch");
    command("ditto", ["-x", "-k", zip, tools], 60_000);
    maestro = path.join(tools, "maestro/bin/maestro");
    report.maestro = { version: "2.11.0", archiveSha256: MAESTRO_SHA };
    report.toolchain = command("xcodebuild", ["-version"]);
    const devices = JSON.parse(
      command("xcrun", ["simctl", "list", "devices", "available", "--json"]),
    );
    let template = chooseSimulatorTemplate(devices);
    const runtimes = JSON.parse(command("xcrun", ["simctl", "list", "runtimes", "--json"]));
    const runtime = runtimes.runtimes.find((r) => r.identifier === template.runtime);
    const air = runtime?.supportedDeviceTypes?.find((d) => /^iPhone.*Air/.test(d.name ?? ""));
    if (air?.identifier) template = { ...template, deviceType: air.identifier, name: air.name };
    report.template = template;
    owned = command("xcrun", [
      "simctl",
      "create",
      "IronStrength-Quality-" + randomUUID().slice(0, 8),
      template.deviceType,
      template.runtime,
    ]);
    if (!uuid.test(owned)) {
      owned = null;
      throw new Error("unexpected_created_simulator");
    }
    report.ownedSimulator = owned;
    save();
    command("xcrun", ["simctl", "boot", owned]);
    command("xcrun", ["simctl", "bootstatus", owned, "-b"], 120_000);
    command("xcrun", ["simctl", "install", owned, app], 60_000);
    command("xcrun", ["simctl", "ui", owned, "appearance", "dark"]);
    flow(
      "01-access-and-first-set",
      fs.readFileSync(path.join(__dirname, "ios-quality/01-access-and-first-set.yaml"), "utf8"),
    );
    const first = storage("first-set");
    if (
      first.active?.completedSets !== 1 ||
      first.active.firstSet.weight !== "30" ||
      first.active.firstSet.reps !== "8" ||
      !first.active.firstSet.done ||
      !first.active.restEndsAt
    )
      throw new Error("first_native_set_not_verified");
    screenshot("first-set-dark");
    await control({ cutApi: true });
    command("xcrun", ["simctl", "terminate", owned, APP_ID]);
    flow(
      "02-cold-recovery",
      fs.readFileSync(path.join(__dirname, "ios-quality/02-cold-recovery.yaml"), "utf8"),
    );
    const recovered = storage("cold-recovery");
    if (JSON.stringify(first.active) !== JSON.stringify(recovered.active))
      throw new Error("native_recovery_changed_series_focus_or_rest");
    screenshot("recovered-offline-dark");
    flow(
      "03-close-locally",
      fs.readFileSync(path.join(__dirname, "ios-quality/03-close-locally.yaml"), "utf8"),
    );
    const pending = storage("pending-local");
    const entry = pending.entries.find((e) => e.workoutId === first.active.workoutId);
    if (!entry || entry.phase !== "pending" || entry.setCount !== 2)
      throw new Error("native_local_close_not_verified");
    screenshot("pending-local-dark");
    command("xcrun", ["simctl", "terminate", owned, APP_ID]);
    flow(
      "04-pending-cold",
      fs.readFileSync(path.join(__dirname, "ios-quality/04-pending-cold.yaml"), "utf8"),
    );
    const pendingAgain = storage("pending-cold").entries.find(
      (e) => e.workoutId === entry.workoutId,
    );
    if (JSON.stringify(pendingAgain) !== JSON.stringify(entry))
      throw new Error("native_pending_payload_changed");
    await control({ cutApi: false, dropNextCreated: true });
    flow(
      "05-reconnect-result",
      fs.readFileSync(path.join(__dirname, "ios-quality/05-reconnect-result.yaml"), "utf8"),
    );
    const confirmed = storage("confirmed").entries.find((e) => e.workoutId === entry.workoutId);
    if (confirmed?.phase !== "confirmed" || confirmed.payloadSha256 !== entry.payloadSha256)
      throw new Error("native_receipt_or_payload_changed");
    const result = await request(qualityResultRoute(entry), {
      token: accessToken,
    });
    const setCount = verifyQualityResult(result, entry);
    const proxy = await request("/__quality/control", { control: true });
    const events = proxy.events.filter((e) => e.workoutId === entry.workoutId);
    if (
      events.filter((e) => e.responseDropped && e.status === "created").length !== 1 ||
      !events.some((e) => e.status === "duplicate" && !e.responseDropped)
    )
      throw new Error("lost_response_replay_not_verified");
    report.workoutId = entry.workoutId;
    report.payloadSha256 = entry.payloadSha256;
    report.payloadVersion = entry.payloadVersion;
    report.authenticatedResultSetCount = setCount;
    report.proxyEvents = events;
    screenshot("confirmed-result-dark");
    command("xcrun", ["simctl", "ui", owned, "appearance", "light"]);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    screenshot("confirmed-result-light");
    report.nativeCircuitPassed = true;
  } catch (error) {
    report.error = scrub(error.message);
  } finally {
    try {
      await control({ cutApi: false, dropNextCreated: false });
      report.proxyRestored = true;
    } catch {
      report.proxyRestored = false;
    }
    if (owned) {
      const a = spawnSync("xcrun", ["simctl", "shutdown", owned], { timeout: 20_000 });
      const b = spawnSync("xcrun", ["simctl", "delete", owned], { timeout: 20_000 });
      report.cleanupComplete = a.status === 0 && b.status === 0;
    }
    report.finishedAt = new Date().toISOString();
    save();
  }
  console.log(
    JSON.stringify({
      nativeCircuitPassed: report.nativeCircuitPassed,
      cleanupComplete: report.cleanupComplete,
      proxyRestored: report.proxyRestored,
      uiReviewRequired: true,
    }),
  );
  if (!report.nativeCircuitPassed || !report.cleanupComplete || !report.proxyRestored)
    process.exitCode = 1;
}
module.exports = {
  readQualityInputs,
  verifyQualitySimulator,
  summarizeNativeStorage,
  redactQualityOutput,
  qualityResultRoute,
  verifyQualityResult,
};
if (require.main === module)
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
