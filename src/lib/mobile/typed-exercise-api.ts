import { z } from "zod";
import { mobileBearerToken, mobileFailure, mobileJson } from "./api";
import { parseExerciseHistoryCursor, type MobileExerciseHistoryCursor } from "./exercise-contracts";
import { typedCatalogSchema, typedExerciseDetailSchema } from "./typed-exercise-contracts";
type Identity = {
  catalog(): Promise<unknown[]>;
  detail(id: string, cursor?: MobileExerciseHistoryCursor): Promise<unknown | null>;
};
export function createTypedExerciseApi(deps: {
  authorize(token: string): Promise<Identity | null>;
}) {
  const identity = async (req: Request) => {
    const token = mobileBearerToken(req);
    return token ? deps.authorize(token) : null;
  };
  const unavailable = () =>
    mobileFailure(
      "unavailable",
      "No pudimos consultar la biblioteca. Reintenta con conexión.",
      503,
    );
  return {
    async catalog(request: Request) {
      try {
        if (new URL(request.url).search)
          return mobileFailure(
            "invalid_input",
            "El catálogo no admite parámetros adicionales.",
            400,
          );
        const actor = await identity(request);
        if (!actor) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        return mobileJson(
          typedCatalogSchema.parse({ version: 2, exercises: await actor.catalog() }),
        );
      } catch {
        return unavailable();
      }
    },
    async detail(request: Request, id: string) {
      try {
        if (!z.uuid().safeParse(id).success)
          return mobileFailure("not_found", "Ese ejercicio no está disponible.", 404);
        const params = new URL(request.url).searchParams,
          raw = params.get("cursor"),
          cursor = raw === null ? undefined : parseExerciseHistoryCursor(raw);
        if (
          [...params.keys()].some((k) => k !== "cursor") ||
          params.getAll("cursor").length > 1 ||
          cursor === null
        )
          return mobileFailure("invalid_input", "El filtro de historial no es válido.", 400);
        const actor = await identity(request);
        if (!actor) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        const result = await actor.detail(id.toLowerCase(), cursor);
        if (!result) return mobileFailure("not_found", "Ese ejercicio no está disponible.", 404);
        const parsed = typedExerciseDetailSchema.parse({ ...result, version: 2 });
        if (parsed.exercise.id !== id.toLowerCase()) return unavailable();
        return mobileJson(parsed);
      } catch {
        return unavailable();
      }
    },
  };
}
