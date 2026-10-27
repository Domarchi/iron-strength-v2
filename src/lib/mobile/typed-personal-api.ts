import { mobileBearerToken, readMobileBody, mobileFailure, mobileJson } from "./api";
import {
  typedPersonalLibrarySchema,
  typedPersonalMutationResultSchema,
  typedPersonalMutationSchema,
  type TypedPersonalMutation,
} from "./typed-personal-contracts";

export function createTypedPersonalApi(deps: {
  authorize(token: string): Promise<{
    userId: string;
    read(): Promise<unknown>;
    mutate(input: TypedPersonalMutation): Promise<unknown>;
  } | null>;
}) {
  const unavailable = () =>
    mobileFailure("unavailable", "No pudimos consultar tus rutinas. Reintenta con conexión.", 503);
  const identity = (request: Request) => {
    const token = mobileBearerToken(request);
    return token ? deps.authorize(token) : null;
  };
  const invalid = () => mobileFailure("invalid_input", "Revisa los datos de la rutina.", 400);
  async function library(request: Request) {
    try {
      if (new URL(request.url).search) return invalid();
      const person = await identity(request);
      if (!person) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
      const parsed = typedPersonalLibrarySchema.parse(await person.read());
      if (parsed.userId !== person.userId.toLowerCase()) return unavailable();
      return mobileJson(parsed);
    } catch {
      return unavailable();
    }
  }
  return {
    library,
    export: library,
    async mutate(request: Request) {
      try {
        if (new URL(request.url).search) return invalid();
        const person = await identity(request);
        if (!person) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        const body = await readMobileBody(request, 65536);
        if (!body.ok) return body.response;
        const parsed = typedPersonalMutationSchema.safeParse(body.value);
        if (!parsed.success) return invalid();
        const input = parsed.data;
        if (input.operation.endsWith("_reorder") && input.targetId !== person.userId.toLowerCase())
          return invalid();
        const result = typedPersonalMutationResultSchema.parse(await person.mutate(input));
        if (result.requestId !== input.requestId || result.targetId !== input.targetId)
          return unavailable();
        return mobileJson(result);
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : null;
        switch (code) {
          case "40001":
          case "23505":
            return mobileFailure(
              "conflict",
              "La rutina cambió. Conserva tus cambios y revisa la versión actual.",
              409,
            );
          case "22023":
            return invalid();
          case "P0002":
            return mobileFailure("not_found", "Esa rutina o carpeta ya no está disponible.", 404);
          case "42501":
            return mobileFailure("forbidden", "Tu cuenta no tiene acceso a esa operación.", 403);
          default:
            return unavailable();
        }
      }
    },
  };
}
