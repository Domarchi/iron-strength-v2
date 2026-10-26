import { describe, expect, it } from "vitest";
import {
  addPersonalExercise,
  editablePersonalItems,
  detachPersonalItem,
  personalEditorBlocks,
  personalItemsInput,
  personalItemInput,
  groupPersonalItems,
  ungroupPersonalItems,
  removePersonalItem,
  duplicatePersonalItem,
  movePersonalBlock,
  detailPersonalItem,
  simplifyPersonalItem,
  patchPersonalItems,
  forkPersonalItems,
} from "./personal-routines";
const id = (n: number) => `ae210000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const exercise = {
  id: id(100),
  name: "Press",
  muscleGroup: "Pecho" as const,
  equipment: null,
  isBodyweight: false,
  progressionIncrementKg: 2.5,
};
const rows = () => [1, 2, 3].map((n) => addPersonalExercise(exercise, id(n)));
describe("edición de bases personales", () => {
  it("conserva texto intermedio y valida kilos, rangos, descansos y detalle al guardar", () => {
    const item = rows()[0];
    expect(personalItemInput(item)).toMatchObject({
      sets: 3,
      repsMin: 8,
      repsMax: 12,
      targetWeightKg: null,
    });
    expect(personalItemInput({ ...item, targetWeightKg: "12,5" }).targetWeightKg).toBe(12.5);
    for (const patch of [
      { sets: "" },
      { sets: "11" },
      { repsMin: "13" },
      { targetWeightKg: "0.001" },
      { restSeconds: "1" },
      { note: "x".repeat(501) },
    ])
      expect(() => personalItemInput({ ...item, ...patch })).toThrow();
    const detailed = detailPersonalItem({ ...item, targetWeightKg: "30" });
    expect(detailed.series).toHaveLength(3);
    const duplicate = duplicatePersonalItem([detailed], detailed.id, id(700));
    duplicate[1].series![0].targetWeightKg = "40";
    expect(duplicate.map((r) => r.id)).toEqual([detailed.id, id(700)]);
    expect(detailed.series![0].targetWeightKg).toBe("30");
    detailed.series![1].targetWeightKg = "25";
    expect(personalItemInput(detailed)).toMatchObject({
      sets: 3,
      targetWeightKg: null,
      series: [{ targetWeightKg: 30 }, { targetWeightKg: 25 }, { targetWeightKg: 30 }],
    });
    expect(personalItemInput(simplifyPersonalItem(detailed))).toMatchObject({
      sets: 3,
      targetWeightKg: 30,
      series: null,
    });
  });
  it("agrupa consecutivos y mueve el bloque completo; separa expresamente", () => {
    const grouped = groupPersonalItems(rows(), [id(1), id(2)], id(90));
    expect(grouped[0].supersetId).toBe(id(90));
    expect(movePersonalBlock(grouped, id(1), 1).map((r) => r.id)).toEqual([id(3), id(1), id(2)]);
    expect(movePersonalBlock(grouped, id(2), -1).map((r) => r.id)).toEqual([id(1), id(2), id(3)]);
    expect(ungroupPersonalItems(grouped, id(90)).every((r) => r.supersetId === null)).toBe(true);
    expect(() => groupPersonalItems(rows(), [id(1), id(3)], id(90))).toThrow();
    expect(() => groupPersonalItems(grouped, [id(2), id(3)], id(91))).toThrow();
  });
  it("duplicar no divide grupo, usa nuevo id y copia independiente", () => {
    const grouped = groupPersonalItems(rows(), [id(1), id(2)], id(90));
    const copied = duplicatePersonalItem(grouped, id(1), id(4));
    expect(copied.map((r) => r.id)).toEqual([id(1), id(2), id(4), id(3)]);
    expect(copied[2].supersetId).toBeNull();
    copied[2].note = "Copia";
    expect(grouped[0].note).toBe("");
    const removed = removePersonalItem(grouped, id(1));
    expect(removed[0].supersetId).toBeNull();
  });
  it("edición colectiva conserva notas/campos no elegidos y detalle de series", () => {
    const input = rows();
    input[0] = detailPersonalItem({ ...input[0], note: "Conservar", targetWeightKg: "30" });
    const changed = patchPersonalItems(input, [id(1), id(2)], { repsMin: "6", restSeconds: "120" });
    expect(changed[0].note).toBe("Conservar");
    expect(changed[0].series?.every((s) => s.repsMin === "6" && s.targetWeightKg === "30")).toBe(
      true,
    );
    expect(changed[1].restSeconds).toBe("120");
    expect(changed[2]).toEqual(input[2]);
    expect(() => patchPersonalItems(input, [id(1)], { repsMax: "2" })).toThrow();
  });
  it("copiar borrador regenera filas/grupos sin mutar origen", () => {
    let n = 200;
    const source = groupPersonalItems(rows(), [id(1), id(2)], id(90));
    const copy = forkPersonalItems(source, () => id(n++));
    expect(copy.every((item) => !source.some((s) => s.id === item.id))).toBe(true);
    expect(copy[0].supersetId).toBe(copy[1].supersetId);
    expect(copy[0].supersetId).not.toBe(id(90));
    expect(source[0].supersetId).toBe(id(90));
  });
});

describe("compatibilidad y límites del editor personal", () => {
  it("recupera detalle nullable y deja copias independientes al editar", () => {
    const first = detailPersonalItem({ ...rows()[0], targetWeightKg: "20", note: "Original" });
    first.series![1].targetWeightKg = "15";
    const input = personalItemInput(first);
    const routine = {
      id: id(300),
      name: "Base",
      folderId: null,
      position: 0,
      revision: 1,
      createdAt: "2026-10-26T12:00:00Z",
      updatedAt: "2026-10-26T12:00:00Z",
      items: [
        { ...exercise, ...input, position: 0 },
        { ...exercise, ...personalItemInput(rows()[1]), position: 1 },
      ],
    };
    const recovered = editablePersonalItems(routine);
    expect(personalItemsInput(recovered)).toEqual([input, personalItemInput(rows()[1])]);
    recovered[0].series![1].targetWeightKg = "10";
    expect(routine.items[0].series![1].targetWeightKg).toBe(15);
    expect(detailPersonalItem(first)).toEqual(first);
    expect(detailPersonalItem(first).series).not.toBe(first.series);
    expect(simplifyPersonalItem(rows()[0])).toEqual(rows()[0]);
  });
  it("sacar integrante del centro mantiene juntos los restantes y disuelve parejas", () => {
    const group = groupPersonalItems(rows(), [id(1), id(2), id(3)], id(90));
    const detached = detachPersonalItem(group, id(2));
    expect(detached.map((r) => r.id)).toEqual([id(1), id(3), id(2)]);
    expect(detached[2].supersetId).toBeNull();
    expect(personalItemsInput(detached)).toHaveLength(3);
    expect(
      detachPersonalItem(groupPersonalItems(rows(), [id(1), id(2)], id(90)), id(1)).every(
        (r) => r.supersetId === null,
      ),
    ).toBe(true);
    expect(detachPersonalItem(rows(), id(1))).toEqual(rows());
    const typingRest = group.map((r) => ({ ...r, supersetRestSeconds: 9 }));
    expect(personalEditorBlocks(typingRest)).toHaveLength(1);
    expect(() => personalItemsInput(typingRest)).toThrow();
    expect(() => movePersonalBlock(typingRest, id(1), 1)).toThrow();
    expect(() => personalItemsInput([group[0], rows()[1]])).toThrow();
  });
  it("límites no alteran origen; cambios de cantidad extienden objetivos sin perder cargas", () => {
    const full = Array.from({ length: 15 }, (_, n) => addPersonalExercise(exercise, id(n + 1)));
    expect(() => duplicatePersonalItem(full, id(1), id(99))).toThrow();
    expect(() => personalItemsInput([...full, addPersonalExercise(exercise, id(99))])).toThrow();
    expect(() => duplicatePersonalItem(rows(), id(99), id(100))).toThrow();
    expect(movePersonalBlock(rows(), id(99), 1)).toEqual(rows());
    const detailed = detailPersonalItem({ ...rows()[0], targetWeightKg: "30" });
    detailed.series![2].targetWeightKg = "25";
    const changed = patchPersonalItems([detailed], [id(1)], { sets: "5", repsMax: "15" });
    expect(changed[0].series?.map((r) => r.targetWeightKg)).toEqual(["30", "30", "25", "25", "25"]);
    expect(changed[0].series?.every((r) => r.repsMax === "15")).toBe(true);
    expect(detailed.series).toHaveLength(3);
    const duplicate = duplicatePersonalItem([detailed], detailed.id, id(700));
    duplicate[1].series![0].targetWeightKg = "40";
    expect(duplicate.map((r) => r.id)).toEqual([detailed.id, id(700)]);
    expect(detailed.series![0].targetWeightKg).toBe("30");
    for (const patch of [
      { sets: "NaN" },
      { repsMax: "101" },
      { repsMin: "1.5" },
      { targetWeightKg: "501" },
    ])
      expect(() => personalItemInput({ ...rows()[0], ...patch })).toThrow();
  });
});
