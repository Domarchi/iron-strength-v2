import { describe, expect, it } from "vitest";
import { formatKg, formatPrescription, formatReps } from "./format";

describe("formatKg (es-CL)", () => {
  it("usa coma decimal y omite decimales innecesarios", () => {
    expect(formatKg(60)).toBe("60 kg");
    expect(formatKg(62.5)).toBe("62,5 kg");
    expect(formatKg(62.25)).toBe("62,25 kg");
    expect(formatKg(0)).toBe("0 kg");
  });

  it("separa los miles", () => {
    expect(formatKg(1250)).toBe("1.250 kg");
  });
});

describe("formatReps", () => {
  it("un rango o un valor fijo", () => {
    expect(formatReps(8, 12)).toBe("8–12");
    expect(formatReps(5, 5)).toBe("5");
  });
});

describe("formatPrescription (RF-14)", () => {
  it("series × repeticiones, con el peso objetivo si existe", () => {
    expect(formatPrescription({ sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: 60 })).toBe(
      "3 × 8–12 · 60 kg",
    );
    expect(formatPrescription({ sets: 5, repsMin: 5, repsMax: 5, targetWeightKg: null })).toBe(
      "5 × 5",
    );
  });

  it("un peso objetivo de 0 se muestra (peso corporal explícito)", () => {
    expect(formatPrescription({ sets: 3, repsMin: 10, repsMax: 15, targetWeightKg: 0 })).toBe(
      "3 × 10–15 · 0 kg",
    );
  });
});
