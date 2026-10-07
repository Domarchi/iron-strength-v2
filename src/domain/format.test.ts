import { describe, expect, it } from "vitest";
import {
  capitalizeFirst,
  formatDuration,
  formatKg,
  formatPrescription,
  formatReps,
} from "./format";

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

describe("formatDuration", () => {
  it("minutos para menos de una hora y horas con minutos para más", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(45)).toBe("1 min"); // se redondea hacia arriba lo que no llega al minuto
    expect(formatDuration(52 * 60)).toBe("52 min");
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(3600 + 5 * 60)).toBe("1 h 05 min");
    expect(formatDuration(2 * 3600 + 30 * 60)).toBe("2 h 30 min");
  });
});

describe("capitalizeFirst", () => {
  it("pone en mayúscula solo la primera letra", () => {
    expect(capitalizeFirst("miércoles, 7 de octubre")).toBe("Miércoles, 7 de octubre");
    expect(capitalizeFirst("")).toBe("");
    expect(capitalizeFirst("ñandú")).toBe("Ñandú");
  });
});
