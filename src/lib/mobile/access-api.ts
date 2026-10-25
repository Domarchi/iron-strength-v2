import { z } from "zod";
import type { RegisterResult } from "../invitations/register";
import { invitationTokenSchema, recoveryTokenSchema, mobileInvitationSchema } from "./contracts";
import { readMobileBody, mobileJson, mobileFailure } from "./api";
export type MobileAccessApiDependencies = {
  invitation(token: string): Promise<Omit<z.infer<typeof mobileInvitationSchema>, "version">>;
  register(input: { token: string; name: string; password: string }): Promise<RegisterResult>;
  reset(input: {
    token: string;
    password: string;
  }): Promise<{ ok: true } | { ok: false; reason: "invalid_link" | "password_rejected" }>;
};
const password = z.string().min(8).max(200);
const invitationInput = z.object({ token: invitationTokenSchema }).strict();
const registerInput = z
  .object({ token: invitationTokenSchema, name: z.string().trim().min(1).max(100), password })
  .strict();
const resetInput = z.object({ token: recoveryTokenSchema, password }).strict();
const messages = {
  inexistente: "Esta invitación no existe. Pídele otra a tu coach.",
  usada:
    "Esta invitación ya fue usada. Si ya creaste tu cuenta, entra con la contraseña que elegiste.",
  vencida: "Esta invitación venció. Pídele otra a tu coach.",
  email_mismatch: "El correo no coincide con la invitación.",
  already_registered:
    "Ya existe una cuenta con este correo. Entra o pide un enlace de recuperación a tu coach.",
  invalid_input: "Revisa tu nombre y contraseña (8 a 200 caracteres).",
};
const unavailable = () =>
  mobileFailure(
    "unavailable",
    "No pudimos confirmar la operación. Si ya elegiste tu contraseña, puedes intentar entrar; conserva el enlace para reintentar.",
    503,
  );
export function createMobileAccessApi(deps: MobileAccessApiDependencies) {
  return {
    async invitation(request: Request) {
      try {
        const input = await readMobileBody(request);
        if (!input.ok) return input.response;
        const parsed = invitationInput.safeParse(input.value);
        if (!parsed.success)
          return mobileFailure("invalid_input", "El enlace de invitación no es válido.", 400);
        return mobileJson(
          mobileInvitationSchema.parse({
            version: 1,
            ...(await deps.invitation(parsed.data.token)),
          }),
        );
      } catch {
        return unavailable();
      }
    },
    async register(request: Request) {
      try {
        const input = await readMobileBody(request);
        if (!input.ok) return input.response;
        const parsed = registerInput.safeParse(input.value);
        if (!parsed.success) return mobileFailure("invalid_input", messages.invalid_input, 400);
        const result = await deps.register(parsed.data);
        if (result.ok) return mobileJson({ version: 1, ok: true, email: result.email }, 201);
        return mobileFailure(
          result.reason,
          messages[result.reason],
          result.reason === "invalid_input"
            ? 400
            : result.reason === "already_registered"
              ? 409
              : 410,
        );
      } catch {
        return unavailable();
      }
    },
    async reset(request: Request) {
      try {
        const input = await readMobileBody(request);
        if (!input.ok) return input.response;
        const parsed = resetInput.safeParse(input.value);
        if (!parsed.success)
          return mobileFailure(
            "invalid_input",
            "Revisa el enlace y usa una contraseña de 8 a 200 caracteres.",
            400,
          );
        const result = await deps.reset(parsed.data);
        if (result.ok) return mobileJson({ version: 1, ok: true });
        return mobileFailure(
          result.reason,
          result.reason === "invalid_link"
            ? "El enlace venció o ya fue usado. Si ya cambiaste tu contraseña, intenta entrar; si no, pídele otro a tu coach."
            : "No se pudo cambiar la contraseña. Prueba otra o pide un enlace nuevo a tu coach.",
          result.reason === "invalid_link" ? 410 : 422,
        );
      } catch {
        return unavailable();
      }
    },
  };
}
