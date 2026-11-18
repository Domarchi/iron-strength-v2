import { describe, expect, it } from "vitest";
import { progressionHint } from "./progression-hint";

const opts = { incrementKg: 2.5, isBodyweight: false, weightUnit: "kg" as const };
const range = { sets: 3, repsMin: 8, repsMax: 10 };
const set = (reps: number, weightKg = 60) => ({ weightKg, reps, isWarmup: false });

describe("progressionHint", () => {
  it("sugiere subir cuando todas las series llegaron al tope", () => {
    expect(progressionHint({ sets: [set(10), set(10), set(10)] }, range, opts)).toMatch(
      /^Sugerencia: sube a 62,5 kg.* 8 reps$/,
    );
  });
  it("sugiere mantener y apuntar al tope si no llegó", () => {
    expect(progressionHint({ sets: [set(10), set(9), set(8)] }, range, opts)).toMatch(
      /^Sugerencia: mantén 60 kg.* 10 reps$/,
    );
  });
  it("no sugiere sin historial, sin rango, con peso corporal ni con detalle por serie", () => {
    expect(progressionHint(null, range, opts)).toBeNull();
    expect(
      progressionHint({ sets: [set(5)] }, { sets: 5, repsMin: 5, repsMax: 5 }, opts),
    ).toBeNull();
    expect(progressionHint({ sets: [set(10)] }, range, { ...opts, isBodyweight: true })).toBeNull();
    expect(progressionHint({ sets: [set(10)] }, { ...range, series: [{}] }, opts)).toBeNull();
  });
});
