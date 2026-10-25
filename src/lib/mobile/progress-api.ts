import { z } from "zod";
import { mobileBearerToken, mobileFailure, mobileJson } from "./api";
import { mobileProgressDetailSchema, type MobileProgressDetail } from "./contracts";
export function createMobileProgressApi(deps: {
  authorize(
    token: string,
  ): Promise<{ detail(id: string): Promise<MobileProgressDetail | null> } | null>;
}) {
  return {
    async detail(request: Request, id: string) {
      try {
        if (!z.uuid().safeParse(id).success)
          return mobileFailure("not_found", "Ese ejercicio no está disponible.", 404);
        if (new URL(request.url).search)
          return mobileFailure(
            "invalid_input",
            "La consulta no admite parámetros adicionales.",
            400,
          );
        const token = mobileBearerToken(request),
          person = token ? await deps.authorize(token) : null;
        if (!person) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        const value = await person.detail(id);
        if (!value)
          return mobileFailure(
            "not_found",
            "Ese ejercicio no tiene registros propios disponibles.",
            404,
          );
        const parsed = mobileProgressDetailSchema.parse(value);
        if (parsed.exercise.exerciseId !== id) throw Error("Mismatched exercise");
        return mobileJson(parsed);
      } catch {
        return mobileFailure("unavailable", "No pudimos cargar el progreso. Reintenta.", 503);
      }
    },
  };
}
