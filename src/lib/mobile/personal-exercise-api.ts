import { mobileBearerToken, readMobileBody, mobileFailure, mobileJson } from "./api";
import {
  personalExerciseLibrarySchema,
  personalExerciseMutationSchema,
  personalExerciseResultSchema,
  type PersonalExerciseMutation,
} from "./personal-exercise-contracts";
export function createPersonalExerciseApi(deps: {
  authorize(token: string): Promise<{
    userId: string;
    read(): Promise<unknown>;
    mutate(input: PersonalExerciseMutation): Promise<unknown>;
  } | null>;
}) {
  const identity = (request: Request) => {
    const token = mobileBearerToken(request);
    return token ? deps.authorize(token) : null;
  };
  const invalid = () => mobileFailure("invalid_input", "Revisa los datos del ejercicio.", 400);
  const unavailable = () =>
    mobileFailure("unavailable", "No pudimos completar la operación. Reintenta con conexión.", 503);
  async function read(request: Request) {
    try {
      if (new URL(request.url).search) return invalid();
      const actor = await identity(request);
      if (!actor) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
      const value = personalExerciseLibrarySchema.parse(await actor.read());
      if (value.userId !== actor.userId.toLowerCase()) return unavailable();
      return mobileJson(value);
    } catch {
      return unavailable();
    }
  }
  return {
    read,
    export: read,
    async mutate(request: Request) {
      try {
        if (new URL(request.url).search) return invalid();
        const actor = await identity(request);
        if (!actor) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        const body = await readMobileBody(request, 16384);
        if (!body.ok) return body.response;
        const parsed = personalExerciseMutationSchema.safeParse(body.value);
        if (!parsed.success) return invalid();
        const value = personalExerciseResultSchema.parse(await actor.mutate(parsed.data));
        if (value.requestId !== parsed.data.requestId || value.targetId !== parsed.data.targetId)
          return unavailable();
        return mobileJson(value);
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : null;
        switch (code) {
          case "40001":
          case "23505":
            return mobileFailure(
              "conflict",
              "El ejercicio cambió o ese nombre ya existe. Conserva tus cambios y revisa la versión actual.",
              409,
            );
          case "22023":
          case "23514":
            return invalid();
          case "P0002":
            return mobileFailure("not_found", "Ese ejercicio ya no está disponible.", 404);
          case "42501":
            return mobileFailure("forbidden", "Tu cuenta no tiene acceso a esa operación.", 403);
          default:
            return unavailable();
        }
      }
    },
  };
}
