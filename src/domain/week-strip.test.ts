import { describe, expect, it } from "vitest";
import { buildWeekStrip, nextPendingSession } from "./week-strip";

describe("buildWeekStrip (RF-61)", () => {
  const monday = "2026-10-05"; // lunes

  it("devuelve lunes a domingo con etiquetas cortas", () => {
    const strip = buildWeekStrip(monday, "2026-10-07", []);
    expect(strip.map((d) => d.date)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    expect(strip.map((d) => d.label)).toEqual(["L", "M", "X", "J", "V", "S", "D"]);
    expect(strip.map((d) => d.dayNumber)).toEqual([5, 6, 7, 8, 9, 10, 11]);
  });

  it("marca hoy, los días pasados, los futuros y los días entrenados", () => {
    const strip = buildWeekStrip(monday, "2026-10-07", ["2026-10-05", "2026-10-07", "2026-10-20"]);
    expect(strip.map((d) => d.isToday)).toEqual([false, false, true, false, false, false, false]);
    expect(strip.map((d) => d.isFuture)).toEqual([false, false, false, true, true, true, true]);
    expect(strip.map((d) => d.trained)).toEqual([true, false, true, false, false, false, false]);
  });

  it("varios entrenamientos el mismo día cuentan como un día entrenado", () => {
    const strip = buildWeekStrip(monday, "2026-10-09", ["2026-10-06", "2026-10-06"]);
    expect(strip.filter((d) => d.trained)).toHaveLength(1);
  });

  it("una semana ya terminada no tiene día de hoy ni futuros", () => {
    const strip = buildWeekStrip(monday, "2026-10-14", []);
    expect(strip.some((d) => d.isToday || d.isFuture)).toBe(false);
  });
});

describe("nextPendingSession (RF-62)", () => {
  const s = (id: string, status: string) => ({ sessionId: id, status });

  it("la primera sesión pendiente, en el orden del programa", () => {
    expect(
      nextPendingSession([s("a", "done"), s("b", "pending"), s("c", "pending")])?.sessionId,
    ).toBe("b");
  });

  it("ignora las sesiones hechas, no realizadas o aún no disponibles", () => {
    expect(nextPendingSession([s("a", "done"), s("b", "missed"), s("c", "upcoming")])).toBeNull();
  });

  it("sin sesiones, no hay siguiente", () => {
    expect(nextPendingSession([])).toBeNull();
  });
});
