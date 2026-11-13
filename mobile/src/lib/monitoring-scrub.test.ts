import { describe, expect, it } from "vitest";
import { redact, scrubEvent } from "./monitoring-scrub";

describe("informes de errores sin datos personales", () => {
  it("elimina usuario, petición, contexto, migas y etiquetas", () => {
    const out = scrubEvent({
      message: "falló",
      user: { email: "ana@example.test", id: "1" },
      request: { url: "https://x/api" },
      extra: { sets: [1] },
      breadcrumbs: [{ message: "tap" }],
      contexts: { device: { name: "iPhone de Ana" } },
      tags: { a: "b" },
      server_name: "host",
      level: "error",
    });
    expect(Object.keys(out).sort()).toEqual(["level", "message"]);
  });
  it("oculta correos, UUID y tokens largos en mensajes y excepciones", () => {
    expect(redact("error con ana@example.test y 11111111-1111-4111-8111-111111111111")).toBe(
      "error con [correo] y [id]",
    );
    expect(redact("token abcdefghijklmnopqrstuvwxyz0123456789ABCD")).toBe("token [token]");
    const out = scrubEvent({
      exception: { values: [{ type: "Error", value: "fallo para ana@example.test" }] },
    });
    expect(JSON.stringify(out)).not.toContain("ana@example.test");
    expect(JSON.stringify(out)).toContain("[correo]");
  });
});
