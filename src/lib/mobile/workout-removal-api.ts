import { z } from "zod";
import { mobileBearerToken, readMobileBody, mobileFailure, mobileJson } from "./api";
import {
  workoutRemovalSchema,
  workoutRemovalReceiptSchema,
  workoutRemovalSnapshotSchema,
  type WorkoutRemoval,
} from "./workout-removal-contracts";

export function createWorkoutRemovalApi(deps: {
  authorize(token: string): Promise<{
    userId: string;
    read(id: string): Promise<unknown>;
    remove(input: WorkoutRemoval): Promise<unknown>;
  } | null>;
}) {
  const invalid = () =>
    mobileFailure("invalid_input", "Revisa la eliminación del entrenamiento.", 400);
  const unavailable = () =>
    mobileFailure(
      "unavailable",
      "No pudimos confirmar la operación. Conserva tus cambios y reintenta con conexión.",
      503,
    );
  const notFound = () =>
    mobileFailure("not_found", "Ese entrenamiento ya no está disponible para tu cuenta.", 404);
  const identify = (request: Request) => {
    const token = mobileBearerToken(request);
    return token ? deps.authorize(token) : null;
  };
  return {
    async read(request: Request, id: string) {
      try {
        const parsedId = z
          .uuid()
          .transform((v) => v.toLowerCase())
          .safeParse(id);
        if (new URL(request.url).search || !parsedId.success) return invalid();
        const actor = await identify(request);
        if (!actor) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        const value = await actor.read(parsedId.data);
        if (value === null) return notFound();
        const snapshot = workoutRemovalSnapshotSchema.parse(value);
        if (snapshot.userId !== actor.userId.toLowerCase() || snapshot.workout.id !== parsedId.data)
          return unavailable();
        return mobileJson(snapshot);
      } catch {
        return unavailable();
      }
    },
    async remove(request: Request) {
      try {
        if (new URL(request.url).search) return invalid();
        const actor = await identify(request);
        if (!actor) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        const body = await readMobileBody(request, 16384);
        if (!body.ok) return body.response;
        const parsed = workoutRemovalSchema.safeParse(body.value);
        if (!parsed.success) return invalid();
        const receipt = workoutRemovalReceiptSchema.parse(await actor.remove(parsed.data));
        if (
          receipt.requestId !== parsed.data.requestId ||
          receipt.workoutId !== parsed.data.workoutId ||
          receipt.revision <= parsed.data.expectedRevision
        )
          return unavailable();
        return mobileJson(receipt);
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : null;
        switch (code) {
          case "40001":
            return mobileFailure(
              "conflict",
              "El entrenamiento cambió. Conserva tus cambios y revisa la versión actual.",
              409,
            );
          case "55000":
            return mobileFailure(
              "edit_locked",
              "Terminó el plazo de siete días para eliminar este entrenamiento. Conservamos tus cambios.",
              409,
            );
          case "22023":
          case "23514":
            return invalid();
          case "P0002":
            return notFound();
          case "42501":
            return mobileFailure("forbidden", "Tu cuenta no tiene acceso a esa operación.", 403);
          default:
            return unavailable();
        }
      }
    },
  };
}
