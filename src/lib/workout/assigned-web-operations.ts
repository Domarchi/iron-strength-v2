import { z } from "zod";
import {
  typedRecordingPayloadSchema,
  typedRecordingReceiptSchema,
  typedRecordingSaveSchema,
  type TypedRecordingPayload,
} from "../mobile/typed-recording-contracts";
import { assignedContextSchema } from "./training-context";
import type { AssignedTrainingContextResult } from "../data/assigned-training-context";

type Code =
  | "unauthorized"
  | "account_changed"
  | "invalid_input"
  | "not_found"
  | "not_current_week"
  | "forbidden"
  | "conflict"
  | "removed"
  | "unavailable";
export type AssignedWebResult<T> =
  { ok: true; value: T } | { ok: false; code: Code; message: string };
const messages: Record<Code, string> = {
  unauthorized: "Vuelve a iniciar sesión. Tu registro se conserva en este dispositivo.",
  account_changed: "La cuenta cambió. Retoma el registro con su cuenta original.",
  invalid_input: "Revisa el entrenamiento, sus métricas y notas.",
  not_found: "La rutina de origen ya no está disponible. Conservamos tu registro.",
  not_current_week: "Solo puedes iniciar sesiones de la semana vigente de tu programa.",
  forbidden: "Tu cuenta no tiene permiso para registrar este entrenamiento.",
  conflict: "La prescripción o el registro cambió. Conservamos tu intento para revisarlo.",
  removed: "Este entrenamiento fue eliminado. Conservamos el registro local para revisarlo.",
  unavailable: "No pudimos confirmar la solicitud. Conserva tu registro y reintenta con conexión.",
};
const failure = (code: Code) => ({ ok: false as const, code, message: messages[code] });
const uuid = z.uuid().transform((v) => v.toLowerCase());
const readRequest = z.object({ version: z.literal(1), userId: uuid, sessionId: uuid }).strict();
const saveRequest = z
  .object({ version: z.literal(1), userId: uuid, payload: typedRecordingPayloadSchema })
  .strict()
  .refine((v) => v.payload.source === "assigned");
function safeFailure(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["40001", "23505"].includes(code)) return failure("conflict");
  if (code === "42501") return failure("forbidden");
  if (code === "P0002") return failure("not_found");
  if (["22023", "22P02", "23514", "23502", "23503", "22003", "P0001"].includes(code))
    return failure("invalid_input");
  return failure("unavailable");
}
/** Authentication is repeated per action. The captured owner is a guard, never authority. */
export function createAssignedWebOperations(deps: {
  authorize(): Promise<{
    userId: string;
    read(sessionId: string): Promise<AssignedTrainingContextResult>;
    save(payload: TypedRecordingPayload): Promise<unknown>;
  } | null>;
}) {
  return {
    async read(value: unknown): Promise<AssignedWebResult<z.infer<typeof assignedContextSchema>>> {
      try {
        const request = readRequest.safeParse(value);
        if (!request.success) return failure("invalid_input");
        const identity = await deps.authorize();
        if (!identity) return failure("unauthorized");
        if (identity.userId !== request.data.userId) return failure("account_changed");
        const result = await identity.read(request.data.sessionId);
        if (!result.ok) return failure(result.reason);
        const context = assignedContextSchema.safeParse(result.context);
        if (
          !context.success ||
          context.data.userId !== identity.userId ||
          context.data.origin.programSessionId !== request.data.sessionId
        )
          return failure("unavailable");
        if (!result.canStart) return failure("not_current_week");
        return { ok: true, value: context.data };
      } catch (error) {
        return safeFailure(error);
      }
    },
    async save(
      value: unknown,
    ): Promise<AssignedWebResult<z.infer<typeof typedRecordingSaveSchema>>> {
      try {
        const bytes = new TextEncoder().encode(JSON.stringify(value));
        if (bytes.byteLength > 262144) return failure("invalid_input");
        const request = saveRequest.safeParse(value);
        if (!request.success) return failure("invalid_input");
        const identity = await deps.authorize();
        if (!identity) return failure("unauthorized");
        if (identity.userId !== request.data.userId) return failure("account_changed");
        const receipt = typedRecordingReceiptSchema.safeParse(
          await identity.save(request.data.payload),
        );
        if (!receipt.success || receipt.data.workoutId !== request.data.payload.id)
          return failure("unavailable");
        if (receipt.data.status === "removed") return failure("removed");
        return {
          ok: true,
          value: typedRecordingSaveSchema.parse({ version: 3, ok: true, ...receipt.data }),
        };
      } catch (error) {
        return safeFailure(error);
      }
    },
  };
}
