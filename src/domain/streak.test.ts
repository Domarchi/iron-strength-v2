import { describe, expect, it } from "vitest";
import { weekOutcome, streaks, type WeekOutcome } from "./streak";
import type { WeekCompliance } from "./completion";

const week = (n: number, outcome: WeekOutcome["outcome"]): WeekOutcome => ({
  weekStart: `2026-${String(Math.floor((n - 1) / 4) + 1).padStart(2, "0")}-${String(((n - 1) % 4) * 7 + 1).padStart(2, "0")}`,
  outcome,
});
const seq = (...o: WeekOutcome["outcome"][]) => o.map((x, i) => week(i + 1, x));

describe("weekOutcome", () => {
  const compliance = (planned: number, done: number): WeekCompliance =>
    planned === 0
      ? { planned: 0, done: 0, ratio: null, complete: false, deload: true }
      : { planned, done, ratio: done / planned, complete: done >= planned, deload: false };

  it("completa si se hicieron todas, aunque la semana siga en curso", () => {
    expect(weekOutcome(compliance(3, 3), false)).toBe("complete");
    expect(weekOutcome(compliance(3, 3), true)).toBe("complete");
  });

  it("incompleta: en curso mientras no termina, perdida cuando termina", () => {
    expect(weekOutcome(compliance(3, 2), false)).toBe("in_progress");
    expect(weekOutcome(compliance(3, 2), true)).toBe("missed");
    expect(weekOutcome(compliance(3, 0), true)).toBe("missed");
  });

  it("la semana de descarga es neutra (DC-11)", () => {
    expect(weekOutcome(compliance(0, 0), true)).toBe("neutral");
    expect(weekOutcome(compliance(0, 0), false)).toBe("neutral");
  });
});

describe("streaks (RF-29, DC-11)", () => {
  it("sin semanas, la racha es 0", () => {
    expect(streaks([])).toEqual({ current: 0, longest: 0 });
  });

  it("cuenta las semanas completas consecutivas hasta hoy", () => {
    expect(streaks(seq("complete", "complete", "complete"))).toEqual({ current: 3, longest: 3 });
  });

  it("una semana perdida rompe la racha actual, pero queda la más larga", () => {
    expect(streaks(seq("complete", "complete", "missed", "complete"))).toEqual({
      current: 1,
      longest: 2,
    });
  });

  it("la racha se mantiene si el último evento es una semana perdida más antigua que la actual", () => {
    expect(streaks(seq("complete", "missed"))).toEqual({ current: 0, longest: 1 });
  });

  it("la semana en curso incompleta no rompe ni suma", () => {
    expect(streaks(seq("complete", "complete", "in_progress"))).toEqual({ current: 2, longest: 2 });
  });

  it("las semanas de descarga y sin programa son neutras: no suman ni rompen", () => {
    expect(streaks(seq("complete", "neutral", "complete"))).toEqual({ current: 2, longest: 2 });
    expect(streaks(seq("complete", "neutral", "neutral", "neutral", "complete"))).toEqual({
      current: 2,
      longest: 2,
    });
  });

  it("el cambio de programa no reinicia la racha (las semanas entre programas son neutras)", () => {
    // programa 1: 2 semanas completas; hueco de 2 semanas sin programa; programa 2: 1 completa
    expect(streaks(seq("complete", "complete", "neutral", "neutral", "complete"))).toEqual({
      current: 3,
      longest: 3,
    });
  });

  it("toma la racha más larga aunque no sea la actual", () => {
    expect(streaks(seq("complete", "complete", "complete", "missed", "complete"))).toEqual({
      current: 1,
      longest: 3,
    });
  });

  it("no depende del orden de entrada", () => {
    const ordered = seq("complete", "missed", "complete", "complete");
    expect(streaks([...ordered].reverse())).toEqual(streaks(ordered));
  });

  it("solo neutras: racha 0", () => {
    expect(streaks(seq("neutral", "neutral"))).toEqual({ current: 0, longest: 0 });
  });
});
