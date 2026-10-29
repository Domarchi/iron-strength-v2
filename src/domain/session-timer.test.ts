import { describe, expect, it } from "vitest";
import { elapsedSessionSeconds, pauseSession, resumeSession } from "./session-timer";

describe("duración de sesión con pausas explícitas", () => {
  const startedAt = Date.parse("2026-10-26T12:00:00Z");
  it("conserva duración habitual sin pausa y nunca muestra valores negativos", () => {
    expect(elapsedSessionSeconds(startedAt, startedAt + 10999, null)).toBe(10);
    expect(elapsedSessionSeconds(startedAt, startedAt - 1000, null)).toBe(0);
    expect(resumeSession(null, startedAt)).toBeNull();
  });
  it("pausar congela la duración aunque transcurra un día y finalizar no incluye la pausa abierta", () => {
    const state = pauseSession(null, startedAt + 10500);
    expect(elapsedSessionSeconds(startedAt, startedAt + 86400000, state)).toBe(10);
    expect(pauseSession(state, startedAt + 20000)).toBe(state);
    expect(state.pausedAtMs).toBe(startedAt + 10500);
  });
  it("acumula fracciones entre pausas y solo redondea el total", () => {
    const first = pauseSession(null, startedAt + 1000),
      running = resumeSession(first, startedAt + 1499),
      second = pauseSession(running, startedAt + 2000),
      resumed = resumeSession(second, startedAt + 2501);
    expect(resumed?.pausedMilliseconds).toBe(1000);
    expect(elapsedSessionSeconds(startedAt, startedAt + 4000, resumed)).toBe(3);
    expect(resumeSession(resumed, startedAt + 5000)).toBe(resumed);
    expect(first.pausedMilliseconds).toBe(0);
    expect(first.pausedAtMs).toBe(startedAt + 1000);
  });
  it("recupera la pausa absoluta y no depende de ticks ni de un intervalo en primer plano", () => {
    const state = pauseSession(null, startedAt + 12345),
      recovered = JSON.parse(JSON.stringify(state));
    expect(elapsedSessionSeconds(startedAt, startedAt + 90000, recovered)).toBe(12);
    const running = resumeSession(recovered, startedAt + 90000);
    expect(elapsedSessionSeconds(startedAt, startedAt + 100000, running)).toBe(22);
  });
  it("retroceder el reloj no descuenta una pausa negativa ni modifica el estado protegido", () => {
    const state = pauseSession(null, startedAt + 10000);
    expect(() => resumeSession(state, startedAt + 9999)).toThrow("hora");
    expect(state).toMatchObject({ pausedAtMs: startedAt + 10000, pausedMilliseconds: 0 });
    expect(elapsedSessionSeconds(startedAt, startedAt + 5000, state)).toBe(10);
  });
});
