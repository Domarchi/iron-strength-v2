import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { auditNativeRuntime } from "../src/lib/operations/native-runtime-audit.ts";

const args = process.argv.slice(2);
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
if (args.length !== 2) {
  console.error("Uso: npm run ops:native-audit -- INFORME_NPM_JSON DIRECTORIO_EXPORTACION");
  process.exitCode = 2;
} else {
  try {
    const directory = await realpath(args[1]);
    const auditBytes = await readFile(args[0]);
    const metadataBytes = await readFile(path.join(directory, "metadata.json"));
    const metadata = z
      .object({
        version: z.literal(0),
        bundler: z.literal("metro"),
        fileMetadata: z.object({
          android: z.object({ bundle: z.string() }),
          ios: z.object({ bundle: z.string() }),
        }),
      })
      .parse(JSON.parse(metadataBytes.toString()));
    const maps: Partial<Record<"android" | "ios", unknown>> = {};
    const hashes: Record<string, string> = {
      audit: digest(auditBytes),
      metadata: digest(metadataBytes),
    };
    for (const platform of ["android", "ios"] as const) {
      const bundle = metadata.fileMetadata[platform].bundle;
      if (!new RegExp(`^_expo/static/js/${platform}/entry-[a-f0-9]{32}\\.hbc$`).test(bundle))
        throw Error("invalid_export");
      for (const suffix of ["", ".map"]) {
        const file = await realpath(path.join(directory, bundle + suffix));
        if (!file.startsWith(directory + path.sep)) throw Error("invalid_export");
        const bytes = await readFile(file);
        hashes[platform + (suffix ? "Map" : "Hermes")] = digest(bytes);
        if (suffix) maps[platform] = JSON.parse(bytes.toString());
        else if (!bytes.subarray(0, 8).equals(Buffer.from("c61fbc03c103191f", "hex")))
          throw Error("invalid_export");
      }
    }
    const lock = await readFile(new URL("../mobile/package-lock.json", import.meta.url));
    hashes.mobileLock = digest(lock);
    const result = auditNativeRuntime(JSON.parse(auditBytes.toString()), maps);
    console.log(
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          scope: "JS de mapas Hermes aportados; avisos del árbol conservados",
          artifactIdentityVerified: false,
          ...result,
          hashes,
        },
        null,
        2,
      ),
    );
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ ok: false, code: "invalid_or_unreadable_input" }));
    process.exitCode = 1;
  }
}
