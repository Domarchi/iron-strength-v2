import { z } from "zod";
import { mobileBearerToken, readMobileBody, mobileFailure, mobileJson } from "./api";
import {
  typedRecordingRequestSchema,
  typedRecordingReceiptSchema,
  typedWorkoutSchema,
  type TypedRecordingPayload,
} from "./typed-recording-contracts";
const invalid = () =>
  mobileFailure("invalid_input", "Revisa el entrenamiento, sus métricas y notas.", 400);
const unavailable = () =>
  mobileFailure("unavailable", "No pudimos confirmar la solicitud. Conservamos tu registro.", 503);
function failure(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["40001", "23505"].includes(code))
    return mobileFailure(
      "conflict",
      "El contenido o la prescripción cambió. Conservamos tu registro para revisarlo.",
      409,
    );
  if (code === "42501")
    return mobileFailure(
      "forbidden",
      "Tu cuenta no tiene permiso para registrar este entrenamiento.",
      403,
    );
  if (code === "P0002")
    return mobileFailure(
      "not_found",
      "La rutina o semana ya no está disponible. Conservamos tu registro.",
      404,
    );
  if (["22023", "22P02", "23514", "23502", "23503", "22003", "P0001"].includes(code))
    return invalid();
  return unavailable();
}
export function createTypedRecordingApi(deps: {
  authorize(token: string): Promise<{
    save(payload: TypedRecordingPayload): Promise<unknown>;
    read(id: string): Promise<unknown>;
  } | null>;
}) {
  return {
    async save(request: Request) {
      try {
        if (new URL(request.url).search) return invalid();
        const token = mobileBearerToken(request),
          identity = token ? await deps.authorize(token) : null;
        if (!identity) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        const body = await readMobileBody(request, 262144);
        if (!body.ok) return body.response;
        const input = typedRecordingRequestSchema.safeParse(body.value);
        if (!input.success) return invalid();
        const receipt = typedRecordingReceiptSchema.parse(await identity.save(input.data.payload));
        if (receipt.workoutId !== input.data.payload.id) return unavailable();
        if (receipt.status === "removed")
          return mobileFailure(
            "removed",
            "El entrenamiento fue eliminado. Conservamos el registro local para revisarlo.",
            422,
          );
        return mobileJson({ version: 3, ok: true, ...receipt });
      } catch (error) {
        return failure(error);
      }
    },
    async read(request: Request, id: string) {
      try {
        if (new URL(request.url).search) return invalid();
        const key = z.uuid().safeParse(id);
        if (!key.success) return invalid();
        const token = mobileBearerToken(request),
          identity = token ? await deps.authorize(token) : null;
        if (!identity) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        const value = await identity.read(key.data.toLowerCase());
        if (value === null)
          return mobileFailure(
            "not_found",
            "No encontramos ese entrenamiento con métricas avanzadas.",
            404,
          );
        const result = typedWorkoutSchema.parse(value);
        if (result.workout.id !== key.data.toLowerCase()) return unavailable();
        return mobileJson(result);
      } catch {
        return unavailable();
      }
    },
  };
}
