import { z } from "zod";
import { bundleSchema } from "@/lib/offline/training-bundle";
import { TrainingDownloadError } from "@/lib/data/training-download";
import { isSameOrigin } from "@/lib/auth/same-origin";
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
const fail = (code: string, message: string, status: number) =>
  json({ version: 1, error: { code, message } }, status);
export function createWebTrainingDownload(deps: {
  authorize(): Promise<{ userId: string; read(): Promise<unknown> } | null>;
}) {
  return async (request: Request) => {
    try {
      if (new URL(request.url).search)
        return fail("invalid_input", "La descarga no admite parámetros adicionales.", 400);
      // GET fetch omits Origin on same-origin requests. A custom account header triggers CORS preflight cross-origin.
      if (request.headers.has("origin") && !isSameOrigin(request))
        return fail("forbidden", "No tienes permiso para consultar esta descarga.", 403);
      const actor = await deps.authorize();
      if (!actor)
        return fail("unauthorized", "Vuelve a iniciar sesión. Conservamos la copia guardada.", 401);
      const captured = z
        .uuid()
        .transform((v) => v.toLowerCase())
        .safeParse(request.headers.get("x-iron-strength-account"));
      if (!captured.success)
        return fail("invalid_input", "La identidad de la descarga no es válida.", 400);
      if (actor.userId.toLowerCase() !== captured.data)
        return fail(
          "account_changed",
          "La cuenta cambió. Abre la descarga con su cuenta original.",
          403,
        );
      const bundle = bundleSchema.parse(await actor.read());
      if (
        bundle.userId !== captured.data ||
        new TextEncoder().encode(JSON.stringify(bundle)).byteLength > 16777216
      )
        throw Error("Incompatible");
      return json(bundle);
    } catch (error) {
      if (error instanceof TrainingDownloadError && error.code === "capacity")
        return fail("capacity", error.message, 409);
      if (error instanceof TrainingDownloadError && error.code === "unauthorized")
        return fail("unauthorized", error.message, 401);
      return fail(
        "unavailable",
        "No pudimos completar la descarga. Conservamos tu copia anterior.",
        503,
      );
    }
  };
}
