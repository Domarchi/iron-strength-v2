import { mobileBearerToken, mobileFailure, mobileJson } from "./api";
import { mobileStudentsSchema, type MobileStudents } from "./contracts";

/** Lista de alumnos del coach: solo lectura, con RLS, solo para el rol coach y sin parámetros. */
export function createMobileStudentsApi(deps: {
  authorize(token: string): Promise<{ isCoach: boolean; read(): Promise<MobileStudents> } | null>;
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
        if (!person.isCoach)
          return mobileFailure("forbidden", "Solo tu coach puede ver esta lista.", 403);
        return mobileJson(mobileStudentsSchema.parse(await person.read()));
      } catch {
        return mobileFailure("unavailable", "No pudimos cargar tus alumnos. Reintenta.", 503);
      }
    },
  };
}
