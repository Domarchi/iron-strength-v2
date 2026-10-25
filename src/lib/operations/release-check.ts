const ORIGIN = "https://iron-strength-seven.vercel.app";
const PATHS = [
  "/login",
  "/api/mobile/v1/week",
  "/api/mobile/v1/workouts",
  "/api/mobile/v1/progress",
];
const MAX_BYTES = 131072;
type Code =
  | "ok"
  | "artifact_mismatch"
  | "unexpected_status"
  | "unsafe_cache"
  | "invalid_contract"
  | "response_too_large"
  | "transport_error";
type Check = { path: string; status: number | null; code: Code; durationMs: number };
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

async function readLimited(response: Response): Promise<string | null> {
  if (Number(response.headers.get("content-length")) > MAX_BYTES) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  } finally {
    reader.releaseLock();
  }
}

export async function checkRelease(expectedBuild: string, fetcher: Fetcher = fetch) {
  if (!/^[a-f0-9]{32}$/.test(expectedBuild)) throw Error("BUILD_ID inválido");
  const checks: Check[] = [];
  for (const path of PATHS) {
    const started = performance.now();
    let code: Code = "transport_error",
      status: number | null = null;
    try {
      const response = await fetcher(ORIGIN + path, {
        method: "GET",
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      status = response.status;
      const text = await readLimited(response);
      if (text === null) code = "response_too_large";
      else if (status !== (path === "/login" ? 200 : 401)) code = "unexpected_status";
      else if (path === "/login")
        code =
          response.headers.get("content-type")?.includes("text/html") &&
          text.includes(expectedBuild)
            ? "ok"
            : "artifact_mismatch";
      else {
        const cache =
          response.headers
            .get("cache-control")
            ?.toLowerCase()
            .split(",")
            .map((s) => s.trim()) ?? [];
        const vary =
          response.headers
            .get("vary")
            ?.toLowerCase()
            .split(",")
            .map((s) => s.trim()) ?? [];
        if (
          !cache.includes("private") ||
          !cache.includes("no-store") ||
          cache.includes("public") ||
          !vary.includes("authorization") ||
          response.headers.has("set-cookie")
        )
          code = "unsafe_cache";
        else {
          let valid = false;
          try {
            const value = JSON.parse(text);
            valid =
              response.headers.get("content-type")?.includes("application/json") === true &&
              value?.version === 1 &&
              value.error?.code === "unauthorized" &&
              Object.keys(value).every((k) => k === "version" || k === "error");
          } catch {
            /* El cuerpo no se incluye en el diagnóstico. */
          }
          code = valid ? "ok" : "invalid_contract";
        }
      }
    } catch {
      /* Nunca publicar detalles del transporte o del servidor. */
    }
    checks.push({ path, status, code, durationMs: Math.round(performance.now() - started) });
  }
  return { origin: ORIGIN, expectedBuild, ok: checks.every((c) => c.code === "ok"), checks };
}
