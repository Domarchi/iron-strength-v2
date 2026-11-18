import {
  mobileMeasurementDeleteSchema,
  mobileMeasurementInputSchema,
  mobileMeasurementResultSchema,
  mobileMeasurementsSchema,
  type MobileMeasurementInput,
  type MobileMeasurements,
} from "./contracts";
import { mobileBearerToken, mobileFailure, mobileJson, readMobileBody } from "./api";

export type MobileMeasurementsIdentity = {
  list(): Promise<MobileMeasurements["items"]>;
  save(
    input: MobileMeasurementInput,
    replace: boolean,
  ): Promise<
    { ok: true; replaced: boolean } | { ok: false; reason: "invalid" | "exists" | "forbidden" }
  >;
  remove(id: string): Promise<{ ok: true } | { ok: false; reason: "not_found" }>;
};
const unauthorized = () => mobileFailure("unauthorized", "Vuelve a iniciar sesión.", 401);
const noQuery = (request: Request) => !new URL(request.url).search;
const unavailable = () =>
  mobileFailure("unavailable", "No pudimos completar la operación. Reintenta.", 503);

/** Medidas corporales propias: GET lista, POST guarda (con confirmación de reemplazo) y POST /delete borra. */
export function createMobileMeasurementsApi(deps: {
  authorize(token: string): Promise<MobileMeasurementsIdentity | null>;
}) {
  async function person(request: Request) {
    const token = mobileBearerToken(request);
    return token ? deps.authorize(token) : null;
  }
  return {
    async list(request: Request) {
      try {
        if (!noQuery(request))
          return mobileFailure(
            "invalid_input",
            "La consulta no admite parámetros adicionales.",
            400,
          );
        const who = await person(request);
        if (!who) return unauthorized();
        return mobileJson(mobileMeasurementsSchema.parse({ version: 1, items: await who.list() }));
      } catch {
        return unavailable();
      }
    },
    async save(request: Request) {
      try {
        if (!noQuery(request))
          return mobileFailure(
            "invalid_input",
            "La consulta no admite parámetros adicionales.",
            400,
          );
        const who = await person(request);
        if (!who) return unauthorized();
        const body = await readMobileBody(request, 4096);
        if (!body.ok) return body.response;
        const parsed = mobileMeasurementInputSchema.safeParse(body.value);
        if (!parsed.success)
          return mobileFailure("invalid_input", "Revisa las medidas ingresadas.", 400);
        const result = await who.save(parsed.data.measurement, parsed.data.replace);
        if (result.ok)
          return mobileJson(
            mobileMeasurementResultSchema.parse({
              version: 1,
              status: result.replaced ? "replaced" : "created",
            }),
          );
        if (result.reason === "exists")
          return mobileFailure(
            "exists",
            "Ya tienes medidas para esa fecha. Confirma si quieres reemplazarlas.",
            409,
          );
        if (result.reason === "forbidden")
          return mobileFailure("forbidden", "No puedes guardar medidas para esa cuenta.", 403);
        return mobileFailure("invalid_input", "Revisa las medidas ingresadas.", 400);
      } catch {
        return unavailable();
      }
    },
    async remove(request: Request) {
      try {
        if (!noQuery(request))
          return mobileFailure(
            "invalid_input",
            "La consulta no admite parámetros adicionales.",
            400,
          );
        const who = await person(request);
        if (!who) return unauthorized();
        const body = await readMobileBody(request, 1024);
        if (!body.ok) return body.response;
        const parsed = mobileMeasurementDeleteSchema.safeParse(body.value);
        if (!parsed.success)
          return mobileFailure("invalid_input", "Revisa los datos enviados.", 400);
        const result = await who.remove(parsed.data.id);
        return result.ok
          ? mobileJson({ version: 1, ok: true })
          : mobileFailure("not_found", "Ese registro ya no existe.", 404);
      } catch {
        return unavailable();
      }
    },
  };
}
