import { describe, expect, it } from "vitest";
import { parseAccessLink, accessTicket } from "./access-link";
const origin = "https://iron-strength-seven.vercel.app";
const invitation = "a".repeat(43),
  recovery = "b".repeat(56);
describe("enlaces de acceso cerrados y sin redirecciones", () => {
  it("acepta enlaces actuales del coach y los esquemas propios", () => {
    expect(parseAccessLink(`${origin}/invite/${invitation}`, origin)).toEqual({
      kind: "invite",
      token: invitation,
    });
    expect(parseAccessLink(`${origin}/reset/${recovery}`, origin)).toEqual({
      kind: "reset",
      token: recovery,
    });
    for (const scheme of ["iron-strength", "iron-strength-preview", "iron-strength-dev"])
      expect(parseAccessLink(`${scheme}://access?kind=reset&token=${recovery}`, origin)).toEqual({
        kind: "reset",
        token: recovery,
      });
  });
  it("rechaza otros orígenes, ambigüedad y credenciales incrustadas", () => {
    for (const value of [
      `https://evil.test/reset/${recovery}`,
      `http://iron-strength-seven.vercel.app/reset/${recovery}`,
      `${origin}/reset/${recovery}?next=https://evil.test`,
      `${origin}/reset/${recovery}#token`,
      `https://usuario:clave@iron-strength-seven.vercel.app/reset/${recovery}`,
      `iron-strength://access?kind=reset&token=${recovery}&token=${recovery}`,
      `iron-strength://access?kind=reset&token=${recovery}&next=/coach`,
      `iron-strength://arbitrary?kind=reset&token=${recovery}`,
      "texto",
      `${origin}/reset/invalid`,
    ])
      expect(parseAccessLink(value, origin)).toBeNull();
  });
  it("parámetros de deep link deben ser únicos y válidos", () => {
    expect(accessTicket("reset", recovery)).toEqual({ kind: "reset", token: recovery });
    expect(accessTicket(["reset", "invite"], recovery)).toBeNull();
    expect(accessTicket("reset", [recovery])).toBeNull();
    expect(accessTicket("admin", recovery)).toBeNull();
  });
});
