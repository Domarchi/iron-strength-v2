import { z } from "zod";
import { mobileBearerToken, mobileFailure, mobileJson } from "./api";
import { assignedContextSchema } from "../workout/training-context";
export type AssignedContextResult =
  | { ok: true; canStart: boolean; context: unknown }
  | { ok: false; reason: "not_found" | "not_current_week" };
export function createAssignedTrainingApi(deps: {
  authorize(
    token: string,
  ): Promise<{ userId: string; read(id: string): Promise<AssignedContextResult> } | null>;
}) {
  return {
    async read(request: Request, id: string) {
      try {
        if (!z.uuid().safeParse(id).success)
          return mobileFailure("not_found", "Esa rutina no está disponible.", 404);
        if (new URL(request.url).search)
          return mobileFailure(
            "invalid_input",
            "La consulta no admite parámetros adicionales.",
            400,
          );
        const token = mobileBearerToken(request),
          actor = token ? await deps.authorize(token) : null;
        if (!actor) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        const result = await actor.read(id.toLowerCase());
        if (!result.ok)
          return result.reason === "not_current_week"
            ? mobileFailure(
                "not_current_week",
                "Solo puedes empezar rutinas de la semana vigente.",
                409,
              )
            : mobileFailure("not_found", "Esa rutina no está disponible.", 404);
        const context = assignedContextSchema.parse(result.context);
        if (context.userId !== actor.userId || context.session.id !== id.toLowerCase())
          throw Error("Identidad incompatible");
        if (!result.canStart)
          return mobileFailure(
            "not_current_week",
            "Solo puedes empezar rutinas de la semana vigente.",
            409,
          );
        return mobileJson(context);
      } catch {
        return mobileFailure(
          "unavailable",
          "No pudimos consultar la rutina completa. Reintenta con conexión.",
          503,
        );
      }
    },
  };
}
