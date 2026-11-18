import {
  mobileCheckinInputSchema,
  mobileCheckinSchema,
  type MobileCheckin,
  type MobileCheckinAnswers,
} from "./contracts";
import { mobileBearerToken, mobileFailure, mobileJson, readMobileBody } from "./api";

export type MobileCheckinIdentity = {
  read(): Promise<MobileCheckin>;
  save(answers: MobileCheckinAnswers): Promise<MobileCheckin>;
};
const unauthorized = () => mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);

/** Check-in semanal propio: GET lee el de la semana vigente y POST lo crea o lo corrige (idempotente). */
export function createMobileCheckinApi(deps: {
  authorize(token: string): Promise<MobileCheckinIdentity | null>;
}) {
  async function person(request: Request) {
    const token = mobileBearerToken(request);
    return token ? deps.authorize(token) : null;
  }
  return {
    async read(request: Request) {
      try {
        if (new URL(request.url).search)
          return mobileFailure(
            "invalid_input",
            "La consulta no admite parámetros adicionales.",
            400,
          );
        const who = await person(request);
        if (!who) return unauthorized();
        return mobileJson(mobileCheckinSchema.parse(await who.read()));
      } catch {
        return mobileFailure("unavailable", "No pudimos cargar tu check-in. Reintenta.", 503);
      }
    },
    async save(request: Request) {
      try {
        if (new URL(request.url).search)
          return mobileFailure(
            "invalid_input",
            "La consulta no admite parámetros adicionales.",
            400,
          );
        const who = await person(request);
        if (!who) return unauthorized();
        const body = await readMobileBody(request, 4096);
        if (!body.ok) return body.response;
        const parsed = mobileCheckinInputSchema.safeParse(body.value);
        if (!parsed.success)
          return mobileFailure("invalid_input", "Revisa las respuestas del check-in.", 400);
        return mobileJson(mobileCheckinSchema.parse(await who.save(parsed.data.answers)));
      } catch {
        return mobileFailure(
          "unavailable",
          "No pudimos guardar tu check-in. Conservamos tus respuestas para reintentar.",
          503,
        );
      }
    },
  };
}
