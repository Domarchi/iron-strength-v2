const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function regularFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 100_000_000)
    throw new Error("Invalid build evidence file");
  return fs.readFileSync(file);
}
function captureIosBuildEvidence(env = process.env) {
  if (!env.PROJECT_DIR || !env.CONFIGURATION_BUILD_DIR)
    throw new Error("Missing Xcode directories");
  const resources = env.UNLOCALIZED_RESOURCES_FOLDER_PATH;
  if (!resources || path.isAbsolute(resources) || resources.split(/[\\/]/).includes(".."))
    throw new Error("Invalid product resources path");
  const projectRoot = path.resolve(env.PROJECT_DIR, "..");
  const directory = path.join(projectRoot, ".build-evidence");
  const directoryStat = fs.lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink())
    throw new Error("Invalid evidence directory");
  if ((directoryStat.mode & 0o077) !== 0) throw new Error("Evidence directory must be private");
  const productRoot = fs.realpathSync(env.CONFIGURATION_BUILD_DIR);
  const bundlePath = path.join(env.CONFIGURATION_BUILD_DIR, resources, "main.jsbundle");
  const realBundle = fs.realpathSync(bundlePath);
  if (!realBundle.startsWith(productRoot + path.sep))
    throw new Error("Product escaped build directory");
  const bundle = regularFile(bundlePath);
  if ((fs.lstatSync(bundlePath).mode & 0o444) !== 0o444)
    throw new Error("Application bundle must remain readable");
  if (bundle.length < 32 || bundle.subarray(0, 8).toString("hex") !== "c61fbc03c103191f")
    throw new Error("Expected a Hermes bundle");
  const mapBytes = regularFile(path.join(directory, "ios.map"));
  const map = JSON.parse(mapBytes.toString("utf8"));
  if (
    map.version !== 3 ||
    !Array.isArray(map.sources) ||
    map.sources.length === 0 ||
    !map.sources.every((source) => typeof source === "string" && source.length > 0) ||
    !Array.isArray(map.sourcesContent) ||
    map.sourcesContent.length !== map.sources.length ||
    !map.sourcesContent.some((content) => typeof content === "string" && content.length > 0) ||
    typeof map.mappings !== "string" ||
    !map.mappings
  )
    throw new Error("Invalid composed source map");
  const buildId = env.EAS_BUILD_ID;
  const sourceCommit = env.EAS_BUILD_GIT_COMMIT_HASH;
  if (!/^[a-f0-9-]{36}$/i.test(buildId ?? "") || !/^[a-f0-9]{40}$/i.test(sourceCommit ?? ""))
    throw new Error("Missing build identity");
  const applicationId = env.PRODUCT_BUNDLE_IDENTIFIER;
  const qualitySimulator =
    applicationId === "com.domarchis.ironstrength.quality" &&
    env.EAS_BUILD === "true" &&
    env.EAS_BUILD_PLATFORM === "ios" &&
    env.EAS_BUILD_PROFILE === "quality-simulator" &&
    env.IRON_QUALITY_SIMULATOR === "1";
  if (
    !["com.domarchis.ironstrength", "com.domarchis.ironstrength.preview"].includes(applicationId) &&
    !qualitySimulator
  )
    throw new Error("Unexpected application identity");
  const outputBundle = path.join(directory, "ios.hbc");
  const outputProof = path.join(directory, "ios-proof.json");
  for (const output of [outputBundle, outputProof]) {
    try {
      fs.lstatSync(output);
      throw new Error("Evidence output already exists");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  const proof = {
    version: 1,
    platform: "ios",
    buildId,
    sourceCommit,
    applicationId,
    bundleSha256: digest(bundle),
    bundleBytes: bundle.length,
    mapSha256: digest(mapBytes),
    mapBytes: mapBytes.length,
    sourceCount: map.sources.length,
  };
  fs.writeFileSync(outputBundle, bundle, { flag: "wx", mode: 0o600 });
  if (digest(regularFile(outputBundle)) !== proof.bundleSha256)
    throw new Error("Evidence copy mismatch");
  fs.chmodSync(path.join(directory, "ios.map"), 0o600);
  fs.writeFileSync(outputProof, JSON.stringify(proof, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return proof;
}
module.exports = { captureIosBuildEvidence };
if (require.main === module) {
  const proof = captureIosBuildEvidence();
  console.log(
    JSON.stringify({ iosBuildEvidence: true, buildId: proof.buildId, sources: proof.sourceCount }),
  );
}
