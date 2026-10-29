import { describe, expect, it } from "vitest";
import { trainingMetricCases } from "../test/fixtures/training-metrics";
import {
  addTypedPersonalExercise,
  typedPersonalItemInput,
  typedPersonalItemsInput,
  editableTypedPersonalItems,
  upgradePersonalEditorItem,
  detailTypedPersonalItem,
  simplifyTypedPersonalItem,
  patchTypedPersonalItems,
  typedPersonalEditorItemSchema,
} from "./typed-personal-routines";
import {
  addPersonalExercise,
  groupPersonalItems,
  forkPersonalItems,
  duplicatePersonalItem,
} from "./personal-routines";
const id = (n: number) => `af215200-0000-4000-8000-${String(n).padStart(12, "0")}`;
const entry = (i = 5) => ({
  id: id(i + 20),
  name: "Ejercicio",
  muscleGroup: "Core" as const,
  equipment: null,
  isBodyweight: false,
  progressionIncrementKg: 2.5,
  recordType: trainingMetricCases[i].recordType,
});
const make = (i = 5) => addTypedPersonalExercise(entry(i), id(i + 1));
describe("editor personal tipado sin pérdida de dimensiones", () => {
  it.each(trainingMetricCases.map((m, i) => [m.recordType, i] as const))(
    "edita %s sin inventar dimensiones",
    (_, i) => {
      const item = make(i),
        m = trainingMetricCases[i];
      expect(typedPersonalEditorItemSchema.parse(item)).toEqual(item);
      Object.assign(item, {
        targetWeightKg: m.weightKg === null ? "" : String(m.weightKg),
        targetDurationSeconds: m.durationSeconds === null ? "" : String(m.durationSeconds),
        targetDistanceMeters: m.distanceMeters === null ? "" : String(m.distanceMeters),
      });
      const value = typedPersonalItemInput(item);
      expect(value.prescribed).toMatchObject({
        recordType: m.recordType,
        sets: 3,
        target: {
          repsMin: m.reps === null ? null : 8,
          repsMax: m.reps === null ? null : 12,
          targetWeightKg: m.weightKg,
          targetDurationSeconds: m.durationSeconds,
          targetDistanceMeters: m.distanceMeters,
        },
      });
    },
  );
  it("convierte texto anterior sin guardar ni inferir tipo, incluyendo detalle", () => {
    const legacy = addPersonalExercise(entry(0), id(1));
    legacy.series = [{ repsMin: "8", repsMax: "10", targetWeightKg: "20,5" }];
    legacy.sets = "1";
    const item = upgradePersonalEditorItem(legacy);
    expect(item).toMatchObject({
      ...legacy,
      recordType: null,
      targetDurationSeconds: "",
      targetDistanceMeters: "",
    });
    expect(item.series![0]).toMatchObject({
      targetWeightKg: "20,5",
      targetDurationSeconds: "",
      targetDistanceMeters: "",
    });
    expect(legacy).not.toHaveProperty("recordType");
  });
  it("conserva objetivos y notas al leer y abrir detalle, y simplifica al primero", () => {
    const item = make();
    item.targetDurationSeconds = "60";
    item.note = "🏋".repeat(500);
    const detailed = detailTypedPersonalItem(item);
    detailed.series![1].targetDurationSeconds = "90";
    const input = typedPersonalItemInput(detailed);
    expect(input.prescribed.target.targetDurationSeconds).toBeNull();
    expect(input.prescribed.series![1].targetDurationSeconds).toBe(90);
    const base = {
      id: id(99),
      name: "Base",
      folderId: null,
      position: 0,
      revision: 1,
      createdAt: "2026-10-27T12:00:00Z",
      updatedAt: "2026-10-27T12:00:00Z",
      items: [{ ...input, ...entry(), id: input.id, exerciseId: input.exerciseId, position: 0 }],
    };
    expect(editableTypedPersonalItems(base)[0]).toEqual({ ...detailed, targetDurationSeconds: "" });
    expect(simplifyTypedPersonalItem(detailed)).toMatchObject({
      series: null,
      targetDurationSeconds: "60",
      sets: "3",
    });
    expect(detailTypedPersonalItem(detailed)).toEqual(detailed);
    expect(simplifyTypedPersonalItem(item)).toEqual(item);
  });
  it("valida límites, texto decimal y campos ocultos sin coaccionar", () => {
    for (const text of ["-1", "0", "1.5", "86401", "abc", "1e2"]) {
      const item = make();
      item.targetDurationSeconds = text;
      expect(() => typedPersonalItemInput(item)).toThrow();
    }
    const item = make();
    item.repsMin = "8";
    expect(() => typedPersonalItemInput(item)).toThrow();
    item.repsMin = "";
    item.note = "🏋".repeat(501);
    expect(() => typedPersonalItemInput(item)).toThrow();
    const weight = make(8);
    weight.targetWeightKg = "20,25";
    weight.targetDistanceMeters = "30,5";
    expect(typedPersonalItemInput(weight).prescribed.target).toMatchObject({
      targetWeightKg: 20.25,
      targetDistanceMeters: 30.5,
    });
    for (const text of ["501", "0.001", "NaN"]) {
      weight.targetWeightKg = text;
      expect(() => typedPersonalItemInput(weight)).toThrow();
    }
  });
  it("respeta descansos y orden/grupos; notas/objetivos no se pierden al duplicar", () => {
    const a = make(),
      b = { ...make(6), id: id(2) };
    a.restSeconds = "";
    expect(typedPersonalItemInput(a).restSeconds).toBeNull();
    for (const rest of ["1", "14", "601", "0.5"]) {
      a.restSeconds = rest;
      expect(() => typedPersonalItemInput(a)).toThrow();
    }
    a.restSeconds = "0";
    const grouped = groupPersonalItems([a, b], [a.id, b.id], id(10));
    expect(typedPersonalItemsInput(grouped)).toHaveLength(2);
    const duplicated = duplicatePersonalItem(grouped, a.id, id(12));
    expect(duplicated[2]).toMatchObject({
      recordType: "duration",
      targetDurationSeconds: "",
      supersetId: null,
    });
    let n = 100;
    const fork = forkPersonalItems(grouped, () => id(n++));
    expect(fork[0].supersetId).toBe(fork[1].supersetId);
    expect(fork[0].supersetId).not.toBe(id(10));
    expect(() => typedPersonalItemsInput([grouped[0]])).toThrow();
    expect(() =>
      typedPersonalItemsInput(Array.from({ length: 16 }, (_, i) => ({ ...a, id: id(i + 200) }))),
    ).toThrow();
  });
  it("edición múltiple mantiene dimensiones/detalle ajenos y rechaza campos incompatibles", () => {
    const a = make(7);
    a.targetDistanceMeters = "1000";
    a.targetDurationSeconds = "300";
    const detailed = detailTypedPersonalItem(a);
    detailed.series![1].targetDurationSeconds = "400";
    const next = patchTypedPersonalItems([detailed], [a.id], {
      sets: "4",
      targetDistanceMeters: "1500",
      restSeconds: "0",
    });
    expect(next[0].series).toHaveLength(4);
    expect(next[0].series![1]).toMatchObject({
      targetDurationSeconds: "400",
      targetDistanceMeters: "1500",
    });
    expect(next[0].series![3].targetDurationSeconds).toBe("300");
    expect(next[0].note).toBe(a.note);
    expect(patchTypedPersonalItems([a, make()], [a.id], { restSeconds: "90" })[1]).toEqual(make());
    expect(() =>
      patchTypedPersonalItems([a, make()], [a.id, make().id], { targetDistanceMeters: "1500" }),
    ).toThrow();
    expect(() => patchTypedPersonalItems([a], [a.id], { sets: "0" })).toThrow();
    expect(patchTypedPersonalItems([detailed], [a.id], { restSeconds: "90" })[0].series).toEqual(
      detailed.series,
    );
  });
  it("explica un rango incompatible sin mostrar detalles internos del contrato", () => {
    const item = make(0);
    item.repsMin = "20";
    expect(() => typedPersonalItemInput(item)).toThrow(
      "Revisa los objetivos y las series de Ejercicio.",
    );
  });
});
