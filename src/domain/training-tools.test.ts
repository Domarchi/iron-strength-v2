import { formatPresentedTrainingMetrics } from "./training-metrics";
import { trainingMetricCases } from "../test/fixtures/training-metrics";
import { describe, expect, it } from "vitest";
import {
  calculatePlates,
  formatWeight,
  formatDistance,
  fromDisplay,
  toDisplay,
} from "./training-tools";
describe("herramientas de entrenamiento", () => {
  it("resuelve carga exacta por lado y prefiere menos discos", () => {
    expect(
      calculatePlates({
        unit: "kg",
        bar: 20,
        target: 100,
        plates: [
          { weight: 20, pairs: 2 },
          { weight: 10, pairs: 4 },
        ],
      }),
    ).toEqual({ ok: true, unit: "kg", bar: 20, target: 100, perSide: [{ weight: 20, count: 2 }] });
  });
  it("no usa una estrategia voraz que ignore una solución disponible", () => {
    expect(
      calculatePlates({
        unit: "lb",
        bar: 0,
        target: 12,
        plates: [
          { weight: 4, pairs: 1 },
          { weight: 3, pairs: 2 },
        ],
      }),
    ).toMatchObject({ ok: true, perSide: [{ weight: 3, count: 2 }] });
  });
  it("desempata con tamaños mayores y usa centésimas exactas", () => {
    expect(
      calculatePlates({
        unit: "kg",
        bar: 20,
        target: 32,
        plates: [
          { weight: 4, pairs: 1 },
          { weight: 3, pairs: 2 },
          { weight: 2, pairs: 1 },
        ],
      }),
    ).toMatchObject({
      ok: true,
      perSide: [
        { weight: 4, count: 1 },
        { weight: 2, count: 1 },
      ],
    });
    expect(
      calculatePlates({ unit: "kg", bar: 0.1, target: 0.7, plates: [{ weight: 0.1, pairs: 3 }] }),
    ).toMatchObject({ ok: true, perSide: [{ weight: 0.1, count: 3 }] });
  });
  it("no redondea ni supone existencias cuando no se puede componer", () => {
    const base = { unit: "kg" as const, bar: 20, plates: [{ weight: 5, pairs: 1 }] };
    expect(calculatePlates({ ...base, target: 10 })).toMatchObject({
      ok: false,
      reason: "below_bar",
    });
    expect(calculatePlates({ ...base, target: 20.01 })).toMatchObject({
      ok: false,
      reason: "asymmetric",
    });
    expect(calculatePlates({ ...base, target: 40 })).toMatchObject({
      ok: false,
      reason: "unavailable",
    });
    expect(calculatePlates({ ...base, target: 20 })).toMatchObject({ ok: true, perSide: [] });
  });
  it("valida límites, cantidades enteras y duplicados", () => {
    for (const invalid of [NaN, Infinity, -1, 501, 20.001, 0.00000000009])
      expect(() => calculatePlates({ unit: "kg", bar: 20, target: invalid, plates: [] })).toThrow();
    for (const plates of [
      [{ weight: 0, pairs: 1 }],
      [{ weight: 5, pairs: 1.5 }],
      [{ weight: 5, pairs: 21 }],
      [
        { weight: 5, pairs: 1 },
        { weight: 5, pairs: 1 },
      ],
      Array.from({ length: 21 }, (_, i) => ({ weight: i + 1, pairs: 1 })),
    ])
      expect(() => calculatePlates({ unit: "kg", bar: 20, target: 30, plates })).toThrow();
  });
  it("convierte unidades sin modificar el valor de origen ni mezclar dimensiones", () => {
    for (const unit of ["kg", "lb", "m", "km", "mi"] as const)
      expect(fromDisplay(toDisplay(123.45, unit), unit)).toBeCloseTo(123.45, 10);
    expect(fromDisplay(1, "lb")).toBe(0.45359237);
    expect(fromDisplay(1, "mi")).toBe(1609.344);
    expect(formatWeight(20, "lb")).toBe("44,09 lb");
    expect(formatDistance(1609.344, "mi")).toBe("1 mi");
    expect(formatWeight(0, "kg")).toBe("0 kg");
    expect(formatDistance(1000, "km")).toBe("1 km");
    expect(() => toDisplay(NaN, "kg")).toThrow();
  });
});

it("presenta todas las métricas en las unidades elegidas sin cambiar su dimensión", () => {
  for (const m of trainingMetricCases) {
    const copy = structuredClone(m);
    const formatted = formatPresentedTrainingMetrics(m, { weightUnit: "lb", distanceUnit: "km" });
    if (m.weightKg !== null) expect(formatted).toContain("lb");
    if (m.distanceMeters !== null) expect(formatted).toContain("km");
    expect(m).toEqual(copy);
  }
});
