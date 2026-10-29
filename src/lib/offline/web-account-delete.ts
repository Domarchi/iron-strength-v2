import { z } from "zod";
import { isSameOrigin } from "../auth/same-origin";
import { isDeleteConfirmation } from "../../domain/account";
import { readMobileBody } from "../mobile/api";
import type { DeleteAccountResult } from "../data/account";
const uuid = z.uuid().transform((v) => v.toLowerCase());
const input = z.strictObject({
  version: z.literal(1),
  userId: uuid,
  confirmation: z.string().max(30),
});
const receipt = z.strictObject({ version: z.literal(1), ok: z.literal(true), userId: uuid });
const messages = {
  unauthorized: "Vuelve a iniciar sesión. Conservamos los datos de este dispositivo.",
  forbidden: "Esta cuenta no se puede borrar desde la app.",
  account_changed: "La cuenta cambió. No borramos otra cuenta ni sus datos locales.",
  invalid_input: "Escribe BORRAR para confirmar.",
  photos: "No pudimos borrar tus fotos. La cuenta sigue disponible; reintenta.",
  unavailable:
    "No pudimos confirmar el borrado. Conservamos los datos locales; comprueba tu acceso antes de reintentar.",
} as const;
function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
const failure = (code: keyof typeof messages, status: number) =>
  json({ version: 1, error: { code, message: messages[code] } }, status);
export function createWebAccountDeletion(deps: {
  authorize(): Promise<{
    userId: string;
    role: "coach" | "student";
    remove(): Promise<DeleteAccountResult>;
    signOut(): Promise<unknown>;
  } | null>;
}) {
  return async (request: Request) => {
    if (!isSameOrigin(request)) return failure("forbidden", 403);
    if (
      new URL(request.url).search ||
      !/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")
    )
      return failure("invalid_input", 400);
    try {
      const actor = await deps.authorize();
      if (!actor) return failure("unauthorized", 401);
      const body = await readMobileBody(request, 16384);
      if (!body.ok) return failure("invalid_input", body.response.status);
      const parsed = input.safeParse(body.value);
      if (!parsed.success || !isDeleteConfirmation(parsed.data.confirmation))
        return failure("invalid_input", 400);
      if (parsed.data.userId !== actor.userId.toLowerCase()) return failure("account_changed", 403);
      if (actor.role !== "student") return failure("forbidden", 403);
      const result = await actor.remove();
      if (!result.ok)
        return failure(
          result.reason === "failed" ? "unavailable" : result.reason,
          result.reason === "forbidden" ? 403 : 503,
        );
      try {
        await actor.signOut();
      } catch {}
      return json(receipt.parse({ version: 1, ok: true, userId: actor.userId }));
    } catch {
      return failure("unavailable", 503);
    }
  };
}
export async function deleteWebAccount(
  userId: string,
  confirmation: string,
  transport: typeof fetch = fetch,
): Promise<{ status: "deleted" } | { status: "error"; message: string }> {
  const valid = input.safeParse({ version: 1, userId, confirmation });
  if (!valid.success || !isDeleteConfirmation(confirmation))
    return { status: "error", message: messages.invalid_input };
  try {
    const response = await transport("/api/account/delete", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, userId, confirmation }),
    });
    const raw: unknown = await response.json();
    if (response.ok) {
      const parsed = receipt.safeParse(raw);
      if (parsed.success && parsed.data.userId === valid.data.userId) return { status: "deleted" };
    } else {
      const parsed = z
        .object({
          version: z.literal(1),
          error: z.object({
            code: z.enum(
              Object.keys(messages) as [keyof typeof messages, ...(keyof typeof messages)[]],
            ),
          }),
        })
        .safeParse(raw);
      if (parsed.success) return { status: "error", message: messages[parsed.data.error.code] };
    }
  } catch {}
  return { status: "error", message: messages.unavailable };
}
