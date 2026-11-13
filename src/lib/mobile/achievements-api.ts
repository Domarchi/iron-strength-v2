import { mobileBearerToken, mobileFailure, mobileJson } from "./api";
import { mobileAchievementsSchema, type MobileAchievements } from "./contracts";

/** GET de solo lectura: racha y logros del propio alumno, con RLS y sin parámetros. */
export function createMobileAchievementsApi(deps: {
  authorize(token: string): Promise<{ read(): Promise<MobileAchievements> } | null>;
}) {
  return {
    async read(request: Request) {
      try {
        if (new URL(request.url).search)
          return mobileFailure(
            "invalid_input",
            "La consulta no admite parámetros adicionales.",
            400,
          );
        const token = mobileBearerToken(request),
          person = token ? await deps.authorize(token) : null;
        if (!person) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        return mobileJson(mobileAchievementsSchema.parse(await person.read()));
      } catch {
        return mobileFailure("unavailable", "No pudimos cargar tus logros. Reintenta.", 503);
      }
    },
  };
}
