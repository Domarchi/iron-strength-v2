import { z } from "zod";
import { mobileBearerToken, mobileFailure, mobileJson } from "./api";
import {
  mobileCatalogSchema,
  mobileExerciseDetailSchema,
  parseExerciseHistoryCursor,
  type MobileExerciseHistoryCursor,
} from "./exercise-contracts";

type Identity = {
  catalog(): Promise<unknown[]>;
  detail(id: string, cursor?: MobileExerciseHistoryCursor): Promise<unknown | null>;
};
export function createMobileExerciseApi(deps: {
  authorize(token: string): Promise<Identity | null>;
}) {
  const unavailable = () =>
    mobileFailure(
      "unavailable",
      "No pudimos consultar la biblioteca. Reintenta con conexión.",
      503,
    );
  const identity = async (request: Request) => {
    const token = mobileBearerToken(request);
    return token ? deps.authorize(token) : null;
  };
  return {
    async catalog(request: Request) {
      try {
        if (new URL(request.url).search)
          return mobileFailure(
            "invalid_input",
            "El catálogo no admite parámetros adicionales.",
            400,
          );
        const person = await identity(request);
        if (!person) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        return mobileJson(
          mobileCatalogSchema.parse({ version: 1, exercises: await person.catalog() }),
        );
      } catch {
        return unavailable();
      }
    },
    async detail(request: Request, id: string) {
      try {
        if (!z.uuid().safeParse(id).success)
          return mobileFailure("not_found", "Ese ejercicio no está disponible.", 404);
        const params = new URL(request.url).searchParams;
        const raw = params.get("cursor");
        const cursor = raw === null ? undefined : parseExerciseHistoryCursor(raw);
        if (
          [...params.keys()].some((key) => key !== "cursor") ||
          params.getAll("cursor").length > 1 ||
          cursor === null
        )
          return mobileFailure("invalid_input", "El filtro de historial no es válido.", 400);
        const person = await identity(request);
        if (!person) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        const detail = await person.detail(id, cursor);
        if (!detail) return mobileFailure("not_found", "Ese ejercicio no está disponible.", 404);
        const parsed = mobileExerciseDetailSchema.parse({ ...detail, version: 1 });
        if (parsed.exercise.id.toLowerCase() !== id.toLowerCase()) throw Error("Exercise mismatch");
        return mobileJson(parsed);
      } catch {
        return unavailable();
      }
    },
  };
}
