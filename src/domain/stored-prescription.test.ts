import { describe, expect, it } from "vitest";
import {
  readLegacyRoutinePrescription,
  readStoredTrainingPrescription,
} from "./stored-prescription";
import { defaultPrescriptionInput, parsePrescriptionInput } from "./prescription-input";
import { RECORD_TYPES } from "./training-metrics";

const legacy = {
  sets: 2,
  reps_min: 8,
  reps_max: 12,
  target_weight_kg: 12.35,
  prescription_sets: null,
  typed_prescription: null,
};
describe("prescripción almacenada del coach", () => {
  it("proyecta un objetivo anterior sin inferir tipo ni métricas nuevas", () => {
    expect(readStoredTrainingPrescription(legacy)).toEqual({
      recordType: null,
      sets: 2,
      series: null,
      target: {
        repsMin: 8,
        repsMax: 12,
        targetWeightKg: 12.35,
        targetDurationSeconds: null,
        targetDistanceMeters: null,
      },
    });
    expect(readLegacyRoutinePrescription(legacy)).toEqual({
      sets: 2,
      repsMin: 8,
      repsMax: 12,
      targetWeightKg: 12.35,
    });
  });
  it("conserva detalle anterior y peso cero explícito", () => {
    const row = {
      ...legacy,
      target_weight_kg: null,
      prescription_sets: [
        { repsMin: 8, repsMax: 12, targetWeightKg: 0 },
        { repsMin: 8, repsMax: 12, targetWeightKg: 12.35 },
      ],
    };
    expect(readStoredTrainingPrescription(row).series?.[0].targetWeightKg).toBe(0);
    expect(readLegacyRoutinePrescription(row).series).toEqual(row.prescription_sets);
  });
  it.each([null, ...RECORD_TYPES])(
    "lee el contrato canónico %s sin convertirlo al lector anterior",
    (kind) => {
      const prescribed = parsePrescriptionInput(defaultPrescriptionInput(kind));
      const row = {
        ...legacy,
        sets: prescribed.sets,
        reps_min: null,
        reps_max: null,
        target_weight_kg: null,
        typed_prescription: prescribed,
      };
      expect(readStoredTrainingPrescription(row)).toEqual(prescribed);
      expect(() => readLegacyRoutinePrescription(row)).toThrow(
        "formato de entrenamiento actualizado",
      );
    },
  );
  it("rechaza resumen anterior incoherente en vez de corregirlo al leer", () => {
    expect(() =>
      readStoredTrainingPrescription({
        ...legacy,
        prescription_sets: [
          { repsMin: 9, repsMax: 10, targetWeightKg: 12.35 },
          { repsMin: 9, repsMax: 10, targetWeightKg: 12.35 },
        ],
      }),
    ).toThrow();
  });
  it("no convierte null o texto en repeticiones", () => {
    expect(() => readLegacyRoutinePrescription({ ...legacy, reps_min: null })).toThrow();
    expect(() => readStoredTrainingPrescription({ ...legacy, reps_min: "8" })).toThrow();
  });
  it("rechaza dos fuentes y cantidades incoherentes", () => {
    const prescribed = parsePrescriptionInput(defaultPrescriptionInput("duration"));
    expect(() =>
      readStoredTrainingPrescription({ ...legacy, sets: 3, typed_prescription: prescribed }),
    ).toThrow();
    expect(() =>
      readStoredTrainingPrescription({
        ...legacy,
        sets: 2,
        reps_min: null,
        reps_max: null,
        target_weight_kg: null,
        typed_prescription: prescribed,
      }),
    ).toThrow();
  });
  it("rechaza un formato futuro sin mutar el objeto recibido", () => {
    const row = { ...legacy, typed_prescription: { version: 99 } };
    const before = JSON.stringify(row);
    expect(() => readStoredTrainingPrescription(row)).toThrow();
    expect(JSON.stringify(row)).toBe(before);
  });
});
