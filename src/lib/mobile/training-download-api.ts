import { bundleSchema } from "../offline/training-bundle";
import { TrainingDownloadError } from "../data/training-download";
import { mobileBearerToken, mobileFailure, mobileJson } from "./api";
/** Exact JWT endpoint. The underlying SQL source also derives its own identity. */
export function createTrainingDownloadApi(deps: {
  authorize(token: string): Promise<{ userId: string; read(): Promise<unknown> } | null>;
}) {
  return {
    async read(request: Request) {
      try {
        if (new URL(request.url).search)
          return mobileFailure(
            "invalid_input",
            "La descarga no admite parámetros adicionales.",
            400,
          );
        const token = mobileBearerToken(request),
          actor = token ? await deps.authorize(token) : null;
        if (!actor) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        const b = bundleSchema.parse(await actor.read());
        if (
          b.userId !== actor.userId.toLowerCase() ||
          new TextEncoder().encode(JSON.stringify(b)).byteLength > 16777216
        )
          throw Error("Descarga incompatible");
        return mobileJson(b);
      } catch (error) {
        if (error instanceof TrainingDownloadError && error.code === "capacity")
          return mobileFailure("capacity", error.message, 409);
        if (error instanceof TrainingDownloadError && error.code === "unauthorized")
          return mobileFailure("unauthorized", error.message, 401);
        return mobileFailure(
          "unavailable",
          "No pudimos completar la descarga. Conservamos tu copia anterior.",
          503,
        );
      }
    },
  };
}
