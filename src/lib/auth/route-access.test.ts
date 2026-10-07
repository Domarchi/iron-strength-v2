import { describe, expect, it } from "vitest";
import { accessDecision, isPublicPath } from "./route-access";

describe("rutas públicas", () => {
  it.each(["/login", "/invite/abc123", "/reset/abc123"])("%s es pública", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(["/", "/week", "/coach/students", "/loginx", "/invitex/abc", "/workout/123"])(
    "%s es protegida",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );
});

describe("decisión de acceso del proxy", () => {
  it("sin sesión, una ruta protegida redirige a /login", () => {
    expect(accessDecision("/week", false)).toBe("redirect-login");
    expect(accessDecision("/coach/students", false)).toBe("redirect-login");
    expect(accessDecision("/", false)).toBe("redirect-login");
  });

  it("sin sesión, una ruta pública pasa", () => {
    expect(accessDecision("/login", false)).toBe("allow");
    expect(accessDecision("/invite/abc", false)).toBe("allow");
  });

  it("con sesión todo pasa: rol y estado activo se validan en el servidor (sin bucles)", () => {
    expect(accessDecision("/week", true)).toBe("allow");
    expect(accessDecision("/coach/students", true)).toBe("allow");
    // Importante: no se redirige fuera de /login, o un usuario desactivado entraría en bucle.
    expect(accessDecision("/login", true)).toBe("allow");
  });
});
