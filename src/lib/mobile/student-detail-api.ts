import { z } from "zod";
import { mobileBearerToken, mobileFailure, mobileJson } from "./api";
import { mobileStudentDetailSchema, type MobileStudentDetail } from "./contracts";

/** Ficha de un alumno del coach: solo lectura, con RLS, solo rol coach y sin parámetros. */
export function createMobileStudentDetailApi(deps: {
  authorize(token: string): Promise<{
    isCoach: boolean;
    read(studentId: string): Promise<MobileStudentDetail | null>;
  } | null>;
}) {
  return {
    async read(request: Request, studentId: string) {
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
          return mobileFailure("forbidden", "Solo tu coach puede ver esta ficha.", 403);
        if (!z.uuid().safeParse(studentId).success)
          return mobileFailure("not_found", "Ese alumno no está disponible.", 404);
        const value = await person.read(studentId);
        if (!value) return mobileFailure("not_found", "Ese alumno no está disponible.", 404);
        return mobileJson(mobileStudentDetailSchema.parse(value));
      } catch {
        return mobileFailure("unavailable", "No pudimos cargar al alumno. Reintenta.", 503);
      }
    },
  };
}
