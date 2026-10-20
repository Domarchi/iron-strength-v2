import { describe, expect, it } from "vitest";
import { prefillWeight, suggestProgression, progressionReason, type LastSet } from "./progression";

const prescription = { sets: 3, repsMin: 8, repsMax: 12 };
const sets = (weight: number, ...reps: number[]): LastSet[] =>
  reps.map((r) => ({ weightKg: weight, reps: r, isWarmup: false }));

const suggest = (lastSets: LastSet[], over: Record<string, unknown> = {}) =>
  suggestProgression({ prescription, lastSets, incrementKg: 2.5, isBodyweight: false, ...over });

describe("suggestProgression (RF-15b: doble progresión)", () => {
  it("al llegar al tope en todas las series, sube el peso y vuelve al mínimo", () => {
    expect(suggest(sets(60, 12, 12, 12))).toEqual({ kind: "increase", weightKg: 62.5, reps: 8 });
  });

  it("repeticiones por encima del tope también cuentan", () => {
    expect(suggest(sets(60, 14, 12, 13))?.kind).toBe("increase");
  });

  it("si alguna serie no llegó al tope, sugiere mantener el peso y apuntar al tope", () => {
    expect(suggest(sets(60, 12, 12, 11))).toEqual({ kind: "keep", weightKg: 60, reps: 12 });
  });

  it("si hizo menos series que las prescritas, mantiene", () => {
    expect(suggest(sets(60, 12, 12))?.kind).toBe("keep");
  });

  it("series extra por encima de las prescritas no estorban", () => {
    expect(suggest(sets(60, 12, 12, 12, 8))?.kind).toBe("keep"); // la 4ª no llegó al tope
    expect(suggest(sets(60, 12, 12, 12, 12))?.kind).toBe("increase");
  });

  it("usa el incremento configurado del ejercicio", () => {
    expect(suggest(sets(20, 12, 12, 12), { incrementKg: 2 })).toMatchObject({ weightKg: 22 });
    expect(suggest(sets(20, 12, 12, 12), { incrementKg: 1 })).toMatchObject({ weightKg: 21 });
  });

  it("redondea a 2 decimales", () => {
    expect(suggest(sets(60.1, 12, 12, 12), { incrementKg: 2.25 })).toMatchObject({
      weightKg: 62.35,
    });
  });

  it("con pesos distintos, parte del mayor peso trabajado", () => {
    const mixed: LastSet[] = [
      { weightKg: 60, reps: 12, isWarmup: false },
      { weightKg: 62.5, reps: 12, isWarmup: false },
      { weightKg: 60, reps: 12, isWarmup: false },
    ];
    expect(suggest(mixed)).toMatchObject({ kind: "increase", weightKg: 65 });
  });

  it("ignora las series de calentamiento", () => {
    const withWarmup: LastSet[] = [
      { weightKg: 30, reps: 5, isWarmup: true },
      ...sets(60, 12, 12, 12),
    ];
    expect(suggest(withWarmup)).toMatchObject({ kind: "increase", weightKg: 62.5 });
    // Calentamientos de sobra no completan las series trabajadas
    expect(suggest([{ weightKg: 30, reps: 12, isWarmup: true }, ...sets(60, 12, 12)])?.kind).toBe(
      "keep",
    );
  });

  it("no sugiere nada sin historial", () => {
    expect(suggest([])).toBeNull();
    expect(suggest([{ weightKg: 30, reps: 12, isWarmup: true }])).toBeNull();
  });

  it("no aplica a rangos fijos (mínimo = máximo)", () => {
    expect(
      suggestProgression({
        prescription: { sets: 5, repsMin: 5, repsMax: 5 },
        lastSets: sets(100, 5, 5, 5, 5, 5),
        incrementKg: 2.5,
        isBodyweight: false,
      }),
    ).toBeNull();
  });

  it("no aplica a ejercicios de peso corporal ni con peso 0", () => {
    expect(suggest(sets(0, 12, 12, 12), { isBodyweight: true })).toBeNull();
    expect(suggest(sets(0, 12, 12, 12))).toBeNull();
  });
});

describe("prefillWeight (DC-9)", () => {
  it("usa el peso prescrito si existe", () => {
    expect(prefillWeight(60, 50)).toBe(60);
    expect(prefillWeight(0, 50)).toBe(0);
  });

  it("si no hay peso prescrito, usa el último peso usado", () => {
    expect(prefillWeight(null, 50)).toBe(50);
  });

  it("sin ninguno, queda vacío", () => {
    expect(prefillWeight(null, null)).toBeNull();
  });
});

describe("motivo de progresión (T150)", () => {
  it("distingue series incompletas, repeticiones pendientes y rango completado", () => {
    expect(progressionReason(prescription, sets(60, 12, 12))).toBe("missing_sets");
    expect(progressionReason(prescription, sets(60, 12, 12, 11))).toBe("below_top");
    expect(progressionReason(prescription, sets(60, 12, 12, 12))).toBe("at_top");
    expect(
      progressionReason(prescription, [
        { weightKg: 20, reps: 12, isWarmup: true },
        ...sets(60, 12, 12),
      ]),
    ).toBe("missing_sets");
  });
});
