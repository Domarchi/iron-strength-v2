import { describe, expect, it } from "vitest";
import {
  LOCK_MS,
  MAX_FAILED_ATTEMPTS,
  WINDOW_MS,
  createLoginGuard,
  hashEmail,
  memoryStore,
} from "./rate-limit";

const MIN = 60_000;

function setup() {
  let now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const guard = createLoginGuard(memoryStore(), () => now);
  return {
    guard,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function fail(guard: ReturnType<typeof setup>["guard"], email: string, times: number) {
  for (let i = 0; i < times; i++) await guard.recordFailure(email);
}

describe("límite de intentos de login (RF-6)", () => {
  it("usa 5 intentos y 15 minutos", () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(5);
    expect(WINDOW_MS).toBe(15 * MIN);
    expect(LOCK_MS).toBe(15 * MIN);
  });

  it("4 fallos no bloquean", async () => {
    const { guard } = setup();
    await fail(guard, "a@test.local", 4);
    expect((await guard.check("a@test.local")).locked).toBe(false);
  });

  it("el 5º fallo bloquea y informa los segundos restantes", async () => {
    const { guard } = setup();
    await fail(guard, "a@test.local", 5);
    const state = await guard.check("a@test.local");
    expect(state.locked).toBe(true);
    expect(state.retryAfterSeconds).toBe(15 * 60);
  });

  it("sigue bloqueado hasta que pasan los 15 minutos", async () => {
    const { guard, advance } = setup();
    await fail(guard, "a@test.local", 5);

    advance(14 * MIN + 59_000);
    expect((await guard.check("a@test.local")).locked).toBe(true);

    advance(1_000);
    expect((await guard.check("a@test.local")).locked).toBe(false);
  });

  it("tras el bloqueo el contador parte de cero", async () => {
    const { guard, advance } = setup();
    await fail(guard, "a@test.local", 5);
    advance(LOCK_MS);

    await fail(guard, "a@test.local", 4);
    expect((await guard.check("a@test.local")).locked).toBe(false);
    await guard.recordFailure("a@test.local");
    expect((await guard.check("a@test.local")).locked).toBe(true);
  });

  it("un inicio de sesión correcto reinicia el contador", async () => {
    const { guard } = setup();
    await fail(guard, "a@test.local", 4);
    await guard.recordSuccess("a@test.local");
    await fail(guard, "a@test.local", 4);
    expect((await guard.check("a@test.local")).locked).toBe(false);
  });

  it("los fallos separados por más de 15 minutos no se acumulan", async () => {
    const { guard, advance } = setup();
    await fail(guard, "a@test.local", 3);
    advance(WINDOW_MS);
    await fail(guard, "a@test.local", 3);
    expect((await guard.check("a@test.local")).locked).toBe(false);
  });

  it("cada correo tiene su propio contador", async () => {
    const { guard } = setup();
    await fail(guard, "a@test.local", 5);
    expect((await guard.check("a@test.local")).locked).toBe(true);
    expect((await guard.check("b@test.local")).locked).toBe(false);
  });

  it("no distingue mayúsculas ni espacios del correo", async () => {
    const { guard } = setup();
    await fail(guard, "  A@Test.Local ", 5);
    expect((await guard.check("a@test.local")).locked).toBe(true);
  });

  it("hashEmail es estable, normaliza y no deja el correo en claro", () => {
    expect(hashEmail(" A@Test.local")).toBe(hashEmail("a@test.local"));
    expect(hashEmail("a@test.local")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashEmail("a@test.local")).not.toContain("test");
  });
});
