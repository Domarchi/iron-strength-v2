import type { WeekPackage } from "../offline/package";
import { parseNativeWeek } from "./download-contract";
import { mobileBearerToken, mobileFailure, mobileJson } from "./api";
export function createMobileDownloadApi(deps: {
  authorize(token: string): Promise<{ userId: string; download(): Promise<WeekPackage> } | null>;
}) {
  return {
    async download(request: Request) {
      try {
        if (new URL(request.url).search)
          return mobileFailure(
            "invalid_input",
            "La descarga no admite parámetros adicionales.",
            400,
          );
        const token = mobileBearerToken(request),
          person = token ? await deps.authorize(token) : null;
        if (!person) return mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
        const record = parseNativeWeek(
          { version: 1, userId: person.userId, pack: await person.download() },
          person.userId,
        );
        if (!record?.pack) throw Error("Incomplete package");
        return mobileJson(record);
      } catch {
        return mobileFailure(
          "unavailable",
          "No pudimos completar la descarga. Actualiza tu semana y reintenta con conexión.",
          503,
        );
      }
    },
  };
}
