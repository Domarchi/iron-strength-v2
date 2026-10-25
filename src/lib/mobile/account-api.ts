import { z } from "zod";
import { isDeleteConfirmation } from "../../domain/account";
import type { DeleteAccountResult } from "../data/account";
import { readMobileBody, mobileJson, mobileFailure, mobileBearerToken } from "./api";
type Dependencies = {
  authorize(token: string): Promise<{ profile: { id: string; role: "student" | "coach" } } | null>;
  remove(token: string): Promise<DeleteAccountResult>;
};
const inputSchema = z.object({ confirmation: z.string().max(30) }).strict();
export function createMobileAccountApi(deps: Dependencies) {
  return {
    async remove(request: Request) {
      try {
        const token = mobileBearerToken(request);
        if (!token) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        const body = await readMobileBody(request);
        if (!body.ok) return body.response;
        const input = inputSchema.safeParse(body.value);
        if (!input.success || !isDeleteConfirmation(input.data.confirmation))
          return mobileFailure("invalid_input", "Escribe BORRAR para confirmar.", 400);
        const identity = await deps.authorize(token);
        if (!identity) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        if (identity.profile.role !== "student")
          return mobileFailure(
            "forbidden",
            "La cuenta propietaria del coach no se elimina desde la app.",
            403,
          );
        const result = await deps.remove(token);
        if (!result.ok)
          return mobileFailure(
            result.reason,
            result.reason === "photos"
              ? "No pudimos completar el borrado de fotos. La cuenta sigue disponible; reintenta la eliminación."
              : "No pudimos confirmar el borrado de la cuenta. Conservamos tus registros locales.",
            result.reason === "forbidden" ? 403 : 503,
          );
        return mobileJson({ version: 1, ok: true, userId: identity.profile.id });
      } catch {
        return mobileFailure(
          "unavailable",
          "No pudimos confirmar el borrado. Conservamos los datos de este dispositivo; comprueba tu acceso antes de reintentar.",
          503,
        );
      }
    },
  };
}
