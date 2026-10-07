import { describe, expect, it } from "vitest";
import { constancyCalendar } from "./constancy";
import type { WeekOutcome } from "./streak";

const outcomes: (WeekOutcome & { planned?: number; done?: number })[] = [
  { weekStart: "2026-09-14", outcome: "complete", planned: 3, done: 3 },
  { weekStart: "2026-09-21", outcome: "missed", planned: 3, done: 1 },
  { weekStart: "2026-09-28", outcome: "neutral" },
  { weekStart: "2026-10-05", outcome: "in_progress", planned: 3, done: 1 },
];

describe("constancyCalendar (RF-29)", () => {
  it("devuelve las últimas N semanas, la actual al final, y 'none' donde no había programa", () => {
    const cal = constancyCalendar(outcomes, "2026-10-07", 6);
    expect(cal.map((w) => w.weekStart)).toEqual([
      "2026-08-31",
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
    ]);
    expect(cal.map((w) => w.outcome)).toEqual([
      "none",
      "none",
      "complete",
      "missed",
      "neutral",
      "in_progress",
    ]);
  });

  it("conserva lo cumplido y lo planificado de cada semana", () => {
    const cal = constancyCalendar(outcomes, "2026-10-07", 4);
    expect(cal[1]).toMatchObject({
      weekStart: "2026-09-21",
      outcome: "missed",
      planned: 3,
      done: 1,
    });
  });

  it("marca cuál es la semana en curso", () => {
    const cal = constancyCalendar(outcomes, "2026-10-07", 3);
    expect(cal.map((w) => w.current)).toEqual([false, false, true]);
  });

  it("sin datos devuelve todas las semanas como 'none'", () => {
    const cal = constancyCalendar([], "2026-10-07", 4);
    expect(cal).toHaveLength(4);
    expect(cal.every((w) => w.outcome === "none")).toBe(true);
  });

  it("el domingo todavía pertenece a la semana que termina", () => {
    const cal = constancyCalendar([], "2026-10-11", 1);
    expect(cal[0].weekStart).toBe("2026-10-05");
  });
});
