import { z } from "zod";

const platforms = ["android", "ios"] as const;
type Platform = (typeof platforms)[number];
const location = z
  .string()
  .refine(
    (value) =>
      value.startsWith("node_modules/") &&
      /^[a-zA-Z0-9_@./-]+$/.test(value) &&
      value.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
  );
const auditSchema = z.object({
  auditReportVersion: z.literal(2),
  vulnerabilities: z.record(
    z.string().min(1),
    z.object({
      severity: z.enum(["info", "low", "moderate", "high", "critical"]),
      nodes: z.array(location).min(1),
      via: z.array(z.union([z.string().min(1), z.object({ name: z.string().min(1) })])).min(1),
    }),
  ),
});
const mapSchema = z
  .object({
    version: z.literal(3),
    mappings: z.string().min(1),
    sources: z.array(z.string().min(1)).min(1),
    sourcesContent: z.array(z.string().nullable()),
  })
  .refine(
    (map) =>
      map.sources.length === map.sourcesContent.length &&
      map.sources.every(
        (source) =>
          source === "\0polyfill:external-require" ||
          (!source.includes("\0") && !source.replaceAll("\\", "/").split("/").includes("..")),
      ),
  );

type Finding = {
  package: string;
  severity: string;
  affectedLocations: string[];
  platforms: Platform[];
};
type Result = {
  ok: boolean;
  code?: "invalid_audit" | "invalid_source_map" | "affected_runtime_module";
  installedPackagesWithWarnings: number;
  inheritedOnly: number;
  findings: Finding[];
  sourceCounts: Partial<Record<Platform, number>>;
};

function dependencySource(source: string): string {
  const normalized = source.replaceAll("\\", "/");
  const index = normalized.indexOf("/node_modules/");
  return index < 0 ? normalized : normalized.slice(index + 1);
}

/** Comprueba presencia en los mapas aportados; no elimina avisos ni audita código nativo. */
export function auditNativeRuntime(
  audit: unknown,
  maps: Partial<Record<Platform, unknown>>,
): Result {
  const empty: Result = {
    ok: false,
    installedPackagesWithWarnings: 0,
    inheritedOnly: 0,
    findings: [],
    sourceCounts: {},
  };
  const parsed = auditSchema.safeParse(audit);
  if (!parsed.success || (audit && typeof audit === "object" && "error" in audit))
    return { ...empty, code: "invalid_audit" };
  const warnings = parsed.data.vulnerabilities;
  // Cada dependencia heredada debe alcanzar un aviso propio conocido; no aceptar grafos incompletos.
  function reachesAdvisory(name: string, visited: Set<string>): boolean {
    if (visited.has(name) || !warnings[name]) return false;
    const seen = new Set([...visited, name]);
    return warnings[name].via.some((via) =>
      typeof via === "string" ? reachesAdvisory(via, seen) : via.name === name,
    );
  }
  for (const [name, warning] of Object.entries(warnings)) {
    if (
      warning.via.some((via) => (typeof via === "string" ? !warnings[via] : via.name !== name)) ||
      !reachesAdvisory(name, new Set())
    )
      return { ...empty, code: "invalid_audit" };
  }
  const sources: Partial<Record<Platform, string[]>> = {};
  for (const platform of platforms) {
    const map = mapSchema.safeParse(maps[platform]);
    if (!map.success) return { ...empty, code: "invalid_source_map" };
    const normalized = map.data.sources.map(dependencySource);
    if (
      !["react-native", "expo-router", "zod"].every((name) =>
        normalized.some((source) => source.startsWith(`node_modules/${name}/`)),
      )
    )
      return { ...empty, code: "invalid_source_map" };
    sources[platform] = normalized;
  }
  const findings: Finding[] = [];
  let inheritedOnly = 0;
  for (const [name, warning] of Object.entries(warnings).sort(([a], [b]) => a.localeCompare(b))) {
    if (!warning.via.some((via) => typeof via !== "string")) {
      inheritedOnly++;
      continue;
    }
    findings.push({
      package: name,
      severity: warning.severity,
      affectedLocations: warning.nodes,
      platforms: platforms.filter((platform) =>
        warning.nodes.some((node) =>
          sources[platform]!.some((source) => source.startsWith(node + "/")),
        ),
      ),
    });
  }
  const affected = findings.some((finding) => finding.platforms.length > 0);
  return {
    ok: !affected,
    ...(affected ? { code: "affected_runtime_module" as const } : {}),
    installedPackagesWithWarnings: Object.keys(warnings).length,
    inheritedOnly,
    findings,
    sourceCounts: Object.fromEntries(
      platforms.map((platform) => [platform, sources[platform]!.length]),
    ),
  };
}
