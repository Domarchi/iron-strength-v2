const { withXcodeProject } = require("expo/config-plugins");
const marker = "# IRON_IOS_BUILD_EVIDENCE_V1";
function decorateBundlePhase(script) {
  if (!script.includes("react-native-xcode.sh"))
    throw new Error("Unexpected React Native bundle phase");
  if (script.includes(marker)) return script;
  const before = [
    marker,
    'if [ "${IRON_CAPTURE_IOS_BUILD_EVIDENCE:-0}" = "1" ]; then',
    '  case "$CONFIGURATION" in',
    "    *Debug*) ;;",
    "    *)",
    "      set -e",
    '      if [ -L "$PROJECT_DIR/../.build-evidence" ]; then exit 1; fi',
    '      (umask 077; mkdir -p "$PROJECT_DIR/../.build-evidence")',
    '      chmod 700 "$PROJECT_DIR/../.build-evidence"',
    '      export SOURCEMAP_FILE="$PROJECT_DIR/../.build-evidence/ios.map"',
    '      if [ -e "$SOURCEMAP_FILE" ] || [ -L "$SOURCEMAP_FILE" ]; then exit 1; fi',
    "      ;;",
    "  esac",
    "fi",
    "",
  ].join("\n");
  const after = [
    "",
    "IRON_NATIVE_BUNDLE_STATUS=$?",
    'if [ "$IRON_NATIVE_BUNDLE_STATUS" -ne 0 ]; then exit "$IRON_NATIVE_BUNDLE_STATUS"; fi',
    'if [ "${IRON_CAPTURE_IOS_BUILD_EVIDENCE:-0}" = "1" ]; then',
    '  case "$CONFIGURATION" in',
    "    *Debug*) ;;",
    '    *) "$NODE_BINARY" "$PROJECT_DIR/../scripts/capture-ios-build-evidence.cjs" ;;',
    "  esac",
    "fi",
    "",
  ].join("\n");
  return before + script + after;
}
function withIosBuildEvidence(config) {
  return withXcodeProject(config, (mod) => {
    const section = mod.modResults.hash.project.objects.PBXShellScriptBuildPhase;
    const entries = Object.entries(section).filter(
      ([key, phase]) =>
        !key.endsWith("_comment") &&
        typeof phase.shellScript === "string" &&
        phase.shellScript.includes("react-native-xcode.sh"),
    );
    if (entries.length !== 1) throw new Error("Expected exactly one React Native bundle phase");
    const phase = entries[0][1];
    phase.shellScript = JSON.stringify(decorateBundlePhase(JSON.parse(phase.shellScript)));
    return mod;
  });
}
module.exports = withIosBuildEvidence;
module.exports.decorateBundlePhase = decorateBundlePhase;
