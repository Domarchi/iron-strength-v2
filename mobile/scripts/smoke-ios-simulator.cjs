const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const MAESTRO_SHA = "5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a";
const CAPTURE_NAMES = ["login-dark", "login-light", "login-reopened"];
const TARGET = Object.freeze({
  appId: "com.domarchis.ironstrength.preview",
  version: "0.1.0",
  buildNumber: "8",
  buildId: "2833dbc9-ade5-4535-a847-86336bf43244",
  sourceCommit: "7d9a7e85d086a5cb8f339b24028eff031ce76319",
  bundleSha256: "7abc046875d8908508451560cccfe5580c4124e3d896bc18a4dedd6cb7596b47",
});
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function previewCaptureFlow(name) {
  if (!CAPTURE_NAMES.includes(name)) throw new Error("unexpected_preview_capture_name");
  return (
    `appId: ${TARGET.appId}\nname: ${name}\n---\n` +
    "- launchApp:\n    clearState: false\n    clearKeychain: false\n    stopApp: false\n" +
    '- assertVisible: "Inicia sesión"\n- assertVisible: "Correo"\n- assertVisible: "Contraseña"\n' +
    `- takeScreenshot: ${name}\n`
  );
}
function verifyCaptureSequence(captures) {
  if (
    !Array.isArray(captures) ||
    captures.length !== CAPTURE_NAMES.length ||
    captures.some(
      (capture, index) =>
        capture?.name !== CAPTURE_NAMES[index] + ".png" ||
        !/^[a-f0-9]{64}$/.test(capture.sha256 ?? "") ||
        !Number.isInteger(capture.bytes) ||
        capture.bytes < 10000,
    ) ||
    captures[0].sha256 === captures[1].sha256
  )
    throw new Error("invalid_preview_capture_sequence");
  return true;
}
function verifySimulatorTarget(info, bundle, expectedHash = TARGET.bundleSha256) {
  if (
    info?.CFBundleIdentifier !== TARGET.appId ||
    info.CFBundleVersion !== TARGET.buildNumber ||
    info.CFBundleShortVersionString !== TARGET.version ||
    info.CFBundleExecutable !== "IronStrengthPreview" ||
    !Array.isArray(info.CFBundleSupportedPlatforms) ||
    info.CFBundleSupportedPlatforms.length !== 1 ||
    info.CFBundleSupportedPlatforms[0] !== "iPhoneSimulator"
  )
    throw new Error("unexpected_simulator_application");
  if (
    !/^[a-f0-9]{64}$/.test(expectedHash ?? "") ||
    bundle.subarray(0, 8).toString("hex") !== "c61fbc03c103191f" ||
    sha(bundle) !== expectedHash
  )
    throw new Error("unexpected_simulator_bundle");
  return {
    appId: TARGET.appId,
    buildNumber: TARGET.buildNumber,
    bundleSha256: sha(bundle),
    executable: info.CFBundleExecutable,
  };
}
function chooseSimulatorTemplate(list) {
  const candidates = [];
  for (const [runtime, devices] of Object.entries(list.devices ?? {})) {
    const match = /^com\.apple\.CoreSimulator\.SimRuntime\.iOS-(\d+)-(\d+)/.exec(runtime);
    if (!match || Number(match[1]) < 16 || (Number(match[1]) === 16 && Number(match[2]) < 4))
      continue;
    for (const device of devices) {
      if (
        device.isAvailable &&
        /^iPhone/.test(device.name ?? "") &&
        /^com\.apple\.CoreSimulator\.SimDeviceType\.iPhone-/.test(device.deviceTypeIdentifier ?? "")
      )
        candidates.push({
          runtime,
          deviceType: device.deviceTypeIdentifier,
          name: device.name,
          score:
            Number(match[1]) * 1000 + Number(match[2]) * 10 + (/Air/.test(device.name) ? 1 : 0),
        });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) throw new Error("no_available_iphone_simulator_template");
  const { runtime, deviceType, name } = candidates[0];
  return { runtime, deviceType, name };
}
function parseLaunchPid(output) {
  const match = /^com\.domarchis\.ironstrength\.preview:\s*(\d+)\s*$/.exec(output.trim());
  if (!match || Number(match[1]) < 1) throw new Error("unexpected_launch_process");
  return Number(match[1]);
}
async function runSimulatorSmoke() {
  if (process.platform !== "darwin") throw new Error("ios_smoke_requires_macos");
  const appPath = fs.realpathSync(process.env.IOS_SMOKE_APP_PATH ?? "");
  if (!appPath.endsWith(".app")) throw new Error("expected_app_directory");
  const deadline = Date.now() + 600_000;
  const out = path.resolve(".simulator-evidence");
  fs.mkdirSync(out, { mode: 0o700 });
  const raw = path.resolve(".ios-quality-raw"),
    tools = path.resolve(".ios-quality-tools");
  fs.mkdirSync(raw, { mode: 0o700 });
  fs.mkdirSync(tools, { mode: 0o700 });
  const report = {
    version: 1,
    buildId: TARGET.buildId,
    artifactSourceCommit: TARGET.sourceCommit,
    startedAt: new Date().toISOString(),
    runtimeProcessChecksPassed: false,
    uiContentVerified: false,
    authenticatedFlowTested: false,
    nativeLoginUiAssertionsPassed: false,
    captureSequenceVerified: false,
    physicalAcceptance: false,
    screenshots: [],
    cleanupComplete: false,
  };
  let ownedSimulator = null,
    maestro = null;
  function command(file, args, timeout = 30_000) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("ios_smoke_deadline");
    const result = spawnSync(file, args, {
      encoding: "utf8",
      timeout: Math.min(timeout, remaining),
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
      fs.writeFileSync(
        path.join(out, "command-error.txt"),
        String(result.stderr ?? result.error?.message ?? "command failed").slice(0, 16000),
        { mode: 0o600 },
      );
      throw new Error("command_failed:" + file + ":" + args.slice(0, 2).join(":"));
    }
    return result.stdout.trim();
  }
  function save() {
    fs.writeFileSync(path.join(out, "proof.json"), JSON.stringify(report, null, 2) + "\n", {
      mode: 0o600,
    });
  }
  async function aliveFor(pid, executable, seconds) {
    for (let i = 0; i < seconds; i++) {
      process.kill(pid, 0);
      const name = command("ps", ["-ww", "-p", String(pid), "-o", "comm="]);
      if (path.basename(name) !== executable) throw new Error("application_process_exited");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  function screenshot(name) {
    const flow = path.join(raw, name + ".yaml"),
      debug = path.join(raw, name);
    fs.writeFileSync(flow, previewCaptureFlow(name), { mode: 0o600 });
    command(
      maestro,
      [
        "--udid",
        ownedSimulator,
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
        flow,
      ],
      210_000,
    );
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
    find(debug, 0);
    if (matches.length !== 1) throw new Error("explicit_preview_capture_not_unique");
    const file = path.join(out, name + ".png");
    fs.copyFileSync(matches[0], file);
    const bytes = fs.readFileSync(file);
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.length < 10000)
      throw new Error("invalid_simulator_screenshot");
    fs.chmodSync(file, 0o600);
    report.screenshots.push({
      name: name + ".png",
      method: "maestro-takeScreenshot",
      sha256: sha(bytes),
      bytes: bytes.length,
    });
    save();
  }
  try {
    const info = JSON.parse(
      command("plutil", ["-convert", "json", "-o", "-", path.join(appPath, "Info.plist")]),
    );
    const target = verifySimulatorTarget(
      info,
      fs.readFileSync(path.join(appPath, "main.jsbundle")),
    );
    if ((fs.statSync(path.join(appPath, "main.jsbundle")).mode & 0o777) !== 0o644)
      throw new Error("unexpected_application_permissions");
    report.target = target;
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
    process.env.MAESTRO_CLI_NO_ANALYTICS = "true";
    process.env.MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED = "true";
    process.env.MAESTRO_DISABLE_UPDATE_CHECK = "true";
    report.maestro = { version: "2.11.0", archiveSha256: MAESTRO_SHA };
    report.toolchain = command("xcodebuild", ["-version"]);
    const template = chooseSimulatorTemplate(
      JSON.parse(command("xcrun", ["simctl", "list", "devices", "available", "--json"])),
    );
    report.template = template;
    const created = command("xcrun", [
      "simctl",
      "create",
      "IronStrength-Smoke-" + randomUUID().slice(0, 8),
      template.deviceType,
      template.runtime,
    ]);
    if (!/^[a-f0-9-]{36}$/i.test(created)) throw new Error("unexpected_created_simulator");
    ownedSimulator = created;
    report.ownedSimulator = ownedSimulator;
    save();
    command("xcrun", ["simctl", "boot", ownedSimulator]);
    command("xcrun", ["simctl", "bootstatus", ownedSimulator, "-b"], 120_000);
    command("xcrun", ["simctl", "install", ownedSimulator, appPath], 60_000);
    command("xcrun", ["simctl", "ui", ownedSimulator, "appearance", "dark"]);
    let pid = parseLaunchPid(
      command("xcrun", [
        "simctl",
        "launch",
        "--terminate-running-process",
        ownedSimulator,
        target.appId,
      ]),
    );
    await aliveFor(pid, target.executable, 12);
    screenshot("login-dark");
    command("xcrun", ["simctl", "ui", ownedSimulator, "appearance", "light"]);
    await aliveFor(pid, target.executable, 3);
    screenshot("login-light");
    command("xcrun", ["simctl", "terminate", ownedSimulator, target.appId]);
    pid = parseLaunchPid(command("xcrun", ["simctl", "launch", ownedSimulator, target.appId]));
    await aliveFor(pid, target.executable, 8);
    screenshot("login-reopened");
    report.captureSequenceVerified = verifyCaptureSequence(report.screenshots);
    report.nativeLoginUiAssertionsPassed = true;
    report.runtimeProcessChecksPassed = true;
  } catch (error) {
    report.error = error.message;
  } finally {
    if (ownedSimulator) {
      const shutdown = spawnSync("xcrun", ["simctl", "shutdown", ownedSimulator], {
        encoding: "utf8",
        timeout: 20_000,
      });
      const deleted = spawnSync("xcrun", ["simctl", "delete", ownedSimulator], {
        encoding: "utf8",
        timeout: 20_000,
      });
      report.cleanupComplete = shutdown.status === 0 && deleted.status === 0;
    }
    report.finishedAt = new Date().toISOString();
    save();
  }
  console.log(
    JSON.stringify({
      iosSimulatorSmoke: report.runtimeProcessChecksPassed,
      screenshots: report.screenshots.length,
      cleanupComplete: report.cleanupComplete,
      uiReviewRequired: true,
    }),
  );
  if (!report.runtimeProcessChecksPassed || !report.cleanupComplete) process.exitCode = 1;
}
module.exports = {
  verifySimulatorTarget,
  chooseSimulatorTemplate,
  parseLaunchPid,
  previewCaptureFlow,
  verifyCaptureSequence,
};
if (require.main === module)
  runSimulatorSmoke().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
