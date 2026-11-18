import { z } from "zod";
import { commentSchema } from "../../domain/schemas";
import type { StudentReplyResult } from "../data/student-reply";
import { mobileBearerToken, mobileFailure, mobileJson, readMobileBody } from "./api";

const replyInput = z
  .object({ workoutId: z.uuid(), id: z.uuid(), body: commentSchema.shape.body })
  .strict();

/** Respuesta del coach a un alumno: solo rol coach, con RLS y reintento idempotente por ID. */
export function createMobileStudentReplyApi(deps: {
  authorize(token: string): Promise<{
    isCoach: boolean;
    reply(
      studentId: string,
      input: { workoutId: string; id: string; body: string },
    ): Promise<StudentReplyResult>;
  } | null>;
}) {
  return {
    async post(request: Request, studentId: string) {
      try {
        const token = mobileBearerToken(request),
          person = token ? await deps.authorize(token) : null;
        if (!person) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        if (!person.isCoach)
          return mobileFailure("forbidden", "Solo tu coach puede responder aquí.", 403);
        if (!z.uuid().safeParse(studentId).success)
          return mobileFailure("not_found", "Ese alumno no está disponible.", 404);
        const body = await readMobileBody(request);
        if (!body.ok) return body.response;
        const parsed = replyInput.safeParse(body.value);
        if (!parsed.success)
          return mobileFailure("invalid_input", "Revisa el mensaje y los datos enviados.", 400);
        const result = await person.reply(studentId, parsed.data);
        if (result.ok)
          return mobileJson(
            { version: 1, status: result.status, id: parsed.data.id },
            result.status === "created" ? 201 : 200,
          );
        return mobileFailure(
          result.reason,
          result.reason === "conflict"
            ? "Ese intento ya tiene otro contenido. Revisa la conversación antes de reintentar."
            : result.reason === "forbidden"
              ? "No puedes responder en este entrenamiento."
              : "Ese entrenamiento no está disponible.",
          result.reason === "conflict" ? 409 : result.reason === "forbidden" ? 403 : 404,
        );
      } catch {
        return mobileFailure(
          "unavailable",
          "No pudimos confirmar tu respuesta. Conservamos tu mensaje para reintentar.",
          503,
        );
      }
    },
  };
}
