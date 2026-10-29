import { mobileBearerToken, readMobileBody, mobileFailure, mobileJson } from "./api";
import {
  recordingReceiptSchema,
  recordingRequestSchema,
  type RecordingPayload,
} from "./recording-contracts";
export function createRecordingApi(deps: {
  authorize(token: string): Promise<{ save(payload: RecordingPayload): Promise<unknown> } | null>;
}) {
  const invalid = () =>
    mobileFailure(
      "invalid_input",
      "Revisa el entrenamiento y su estructura antes de enviarlo.",
      400,
    );
  const unavailable = () =>
    mobileFailure(
      "unavailable",
      "No pudimos confirmar el entrenamiento. Conservamos tu registro.",
      503,
    );
  return {
    async save(request: Request) {
      try {
        if (new URL(request.url).search) return invalid();
        const token = mobileBearerToken(request),
          identity = token ? await deps.authorize(token) : null;
        if (!identity) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        const body = await readMobileBody(request, 262144);
        if (!body.ok) return body.response;
        const input = recordingRequestSchema.safeParse(body.value);
        if (!input.success) return invalid();
        const receipt = recordingReceiptSchema.parse(await identity.save(input.data.payload));
        if (receipt.workoutId !== input.data.payload.id) return unavailable();
        if (receipt.status === "removed")
          return mobileFailure(
            "removed",
            "Este entrenamiento fue eliminado. Conservamos el registro local para que lo revises.",
            422,
          );
        return mobileJson({ version: 2, ok: true, ...receipt });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : null;
        if (code === "40001")
          return mobileFailure(
            "conflict",
            "La prescripción cambió. Conservamos el registro para que lo revises.",
            409,
          );
        if (code === "23505")
          return mobileFailure(
            "conflict",
            "El identificador ya se usó con otro contenido. Conservamos tu registro.",
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
            "La rutina o semana de origen ya no está disponible. Conservamos tu registro.",
            404,
          );
        if (["22023", "22P02", "23514", "23502", "23503", "22003", "P0001"].includes(String(code)))
          return invalid();
        return unavailable();
      }
    },
  };
}
