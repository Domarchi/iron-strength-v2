import {
  buildTrainingProgress,
  trainingProgressSourceSchema,
} from "../../domain/training-progress";
import { mobileBearerToken, mobileFailure, mobileJson } from "./api";
import { trainingProgressSchema } from "./training-progress-contracts";
export function createTrainingProgressApi(deps: {
  authorize(token: string): Promise<{ userId: string; read(): Promise<unknown> } | null>;
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
          actor = token ? await deps.authorize(token) : null;
        if (!actor) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        const source = trainingProgressSourceSchema.parse(await actor.read());
        if (source.userId !== actor.userId) throw Error("Identidad incompatible.");
        return mobileJson(
          trainingProgressSchema.parse({
            version: 2,
            userId: source.userId,
            today: source.today,
            ...buildTrainingProgress(source),
          }),
        );
      } catch {
        return mobileFailure(
          "unavailable",
          "No pudimos cargar el historial y progreso completos. Reintenta.",
          503,
        );
      }
    },
  };
}
