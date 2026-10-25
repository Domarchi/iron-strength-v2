import { z } from "zod";
import { commentSchema } from "../../domain/schemas";
import {
  parseCommentCursor,
  type CommentWriteResult,
  type CommentDeleteResult,
} from "../data/mobile-comments";
import { mobileCommentsSchema, mobileUnreadCommentsSchema, type MobileComments } from "./contracts";
import { mobileBearerToken, mobileJson, mobileFailure, readMobileBody } from "./api";
export type MobileCommentsIdentity = {
  unread(): Promise<z.infer<typeof mobileUnreadCommentsSchema>["items"]>;
  list(
    workoutId: string,
    cursor?: string,
  ): Promise<Omit<MobileComments, "version" | "workoutId"> | null>;
  publish(workoutId: string, input: { id: string; body: string }): Promise<CommentWriteResult>;
  remove(workoutId: string, id: string): Promise<CommentDeleteResult>;
  markRead(workoutId: string): Promise<boolean | null>;
};
const message = z.object({ id: z.uuid(), body: commentSchema.shape.body }).strict();
const removeInput = z.object({ id: z.uuid() }).strict();
const readInput = z.object({}).strict();
const unauthorized = () => mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
const missing = () => mobileFailure("not_found", "Ese entrenamiento no está disponible.", 404);
const invalid = () =>
  mobileFailure("invalid_input", "Revisa el mensaje y los datos enviados.", 400);
const unavailable = () =>
  mobileFailure(
    "unavailable",
    "No pudimos confirmar la conversación. Conservamos tu mensaje para reintentar.",
    503,
  );
export function createMobileCommentsApi(deps: {
  authorize(token: string): Promise<MobileCommentsIdentity | null>;
}) {
  async function auth(request: Request) {
    const token = mobileBearerToken(request);
    return token ? deps.authorize(token) : null;
  }
  return {
    async unread(request: Request) {
      try {
        if (new URL(request.url).search) return invalid();
        const person = await auth(request);
        return person
          ? mobileJson(
              mobileUnreadCommentsSchema.parse({ version: 1, items: await person.unread() }),
            )
          : unauthorized();
      } catch {
        return unavailable();
      }
    },
    async list(request: Request, workoutId: string) {
      try {
        if (!z.uuid().safeParse(workoutId).success) return missing();
        const params = new URL(request.url).searchParams,
          keys = [...params.keys()],
          cursor = params.get("cursor");
        if (
          keys.some((k) => k !== "cursor") ||
          keys.length > 1 ||
          (cursor !== null && !parseCommentCursor(cursor))
        )
          return invalid();
        const person = await auth(request);
        if (!person) return unauthorized();
        const result = await person.list(workoutId, cursor ?? undefined);
        return result
          ? mobileJson(mobileCommentsSchema.parse({ version: 1, workoutId, ...result }))
          : missing();
      } catch {
        return unavailable();
      }
    },
    async publish(request: Request, workoutId: string) {
      try {
        if (!z.uuid().safeParse(workoutId).success) return missing();
        const person = await auth(request);
        if (!person) return unauthorized();
        const body = await readMobileBody(request);
        if (!body.ok) return body.response;
        const parsed = message.safeParse(body.value);
        if (!parsed.success) return invalid();
        const result = await person.publish(workoutId, parsed.data);
        if (result.ok)
          return mobileJson(
            { version: 1, workoutId, ...result },
            result.status === "created" ? 201 : 200,
          );
        return mobileFailure(
          result.reason,
          result.reason === "removed"
            ? "Este comentario ya se publicó y fue borrado. Descarta su borrador para mantenerlo borrado; puedes empezar otro mensaje después."
            : result.reason === "conflict"
              ? "Ese intento ya tiene otro contenido. Conservamos tu mensaje; revisa la conversación antes de descartar."
              : "No se pudo publicar este comentario.",
          result.reason === "not_found"
            ? 404
            : result.reason === "conflict" || result.reason === "removed"
              ? 409
              : result.reason === "forbidden"
                ? 403
                : 400,
        );
      } catch {
        return unavailable();
      }
    },
    async remove(request: Request, workoutId: string) {
      try {
        if (!z.uuid().safeParse(workoutId).success) return missing();
        const person = await auth(request);
        if (!person) return unauthorized();
        const body = await readMobileBody(request);
        if (!body.ok) return body.response;
        const parsed = removeInput.safeParse(body.value);
        if (!parsed.success) return invalid();
        const result = await person.remove(workoutId, parsed.data.id);
        return result.ok
          ? mobileJson({ version: 1, workoutId, id: parsed.data.id, ...result })
          : mobileFailure(
              result.reason,
              "Solo puedes borrar tus propios comentarios de este entrenamiento.",
              result.reason === "not_found" ? 404 : 403,
            );
      } catch {
        return unavailable();
      }
    },
    async markRead(request: Request, workoutId: string) {
      try {
        if (!z.uuid().safeParse(workoutId).success) return missing();
        const person = await auth(request);
        if (!person) return unauthorized();
        const body = await readMobileBody(request);
        if (!body.ok) return body.response;
        if (!readInput.safeParse(body.value).success) return invalid();
        const result = await person.markRead(workoutId);
        return result === null
          ? missing()
          : result
            ? mobileJson({ version: 1, ok: true, workoutId })
            : unavailable();
      } catch {
        return unavailable();
      }
    },
  };
}
