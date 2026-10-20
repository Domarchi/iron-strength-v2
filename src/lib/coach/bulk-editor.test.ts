import { expect, it } from "vitest";
import { buildBulkPreview, effectivePrescription, type BulkDraft } from "./bulk-editor";
import type { SessionExerciseRow } from "@/lib/data/programs";
const row = (id: string, over: Partial<SessionExerciseRow> = {}): SessionExerciseRow => ({
  id,
  exerciseId: "10000000-0000-4000-8000-000000000001",
  name: id,
  muscleGroup: "Piernas",
  equipment: "Barra",
  isBodyweight: false,
  incrementKg: 2.5,
  archived: false,
  position: Number(id) || 0,
  sets: 3,
  repsMin: 8,
  repsMax: 12,
  targetWeightKg: 60,
  note: "Conservar",
  restSeconds: 45,
  supersetId: null,
  supersetRestSeconds: null,
  ...over,
});
const draft = (over: Partial<BulkDraft> = {}): BulkDraft => ({
  ids: ["a", "b"],
  setsEnabled: true,
  repsEnabled: false,
  restEnabled: false,
  sets: "4",
  repsMin: "8",
  repsMax: "12",
  restSeconds: "90",
  ...over,
});
it("aplica solo campos elegidos, conserva notas/peso y deja sin tocar no seleccionados", () => {
  const result = buildBulkPreview([row("a"), row("b"), row("c")], draft());
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.changes.map((r) => r.id)).toEqual(["a", "b"]);
    expect(result.changes[0]).toMatchObject({
      sets: "4",
      note: "Conservar",
      targetWeightKg: "60",
      fields: ["sets"],
    });
  }
});
it("revisar una versión nueva conserva campos remotos no seleccionados", () => {
  const result = buildBulkPreview([row("a")], draft({ ids: ["a"] }));
  if (!result.ok) throw Error(result.error);
  expect(
    effectivePrescription(
      row("a", { note: "Nota remota", targetWeightKg: 75, repsMax: 15 }),
      result.changes[0],
    ),
  ).toMatchObject({
    sets: "4",
    note: "Nota remota",
    targetWeightKg: "75",
    repsMax: "15",
    fields: ["sets"],
  });
});
it("el descanso de una superserie exige todos sus integrantes y preserva su descanso individual", () => {
  const rows = [
    row("a", { supersetId: "group", supersetRestSeconds: 120 }),
    row("b", { supersetId: "group", supersetRestSeconds: 120 }),
    row("c"),
  ];
  expect(buildBulkPreview(rows, draft({ ids: ["a"], restEnabled: true }))).toMatchObject({
    ok: false,
  });
  const result = buildBulkPreview(
    rows,
    draft({ ids: ["a", "b", "c"], setsEnabled: false, restEnabled: true, restSeconds: "180" }),
  );
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.changes[0]).toMatchObject({
      supersetRestSeconds: "180",
      fields: ["supersetRestSeconds"],
    });
    expect(result.changes[0].restSeconds).toBeUndefined();
    expect(result.changes[2]).toMatchObject({ restSeconds: "180", fields: ["restSeconds"] });
  }
});
it("rechaza selección inválida, rangos invertidos y campos incompletos; permite 15 filas", () => {
  for (const invalid of [
    draft({ ids: [] }),
    draft({ ids: ["a", "a"] }),
    draft({ ids: ["missing"] }),
    draft({ sets: "" }),
    draft({ repsEnabled: true, repsMin: "15", repsMax: "10" }),
    draft({ restEnabled: true, restSeconds: "8" }),
  ])
    expect(buildBulkPreview([row("a"), row("b")], invalid).ok).toBe(false);
  const rows = Array.from({ length: 15 }, (_, i) => row(String(i)));
  expect(buildBulkPreview(rows, draft({ ids: rows.map((r) => r.id) })).ok).toBe(true);
});
