import {
  prescriptionMutationSchema,
  type PrescriptionField,
  type SessionExerciseInput,
} from "@/domain/schemas";

export type PrescriptionDraft = {
  id: string;
  exerciseId: string;
  sets: string;
  repsMin: string;
  repsMax: string;
  targetWeightKg: string;
  note: string;
  restSeconds?: string;
  supersetRestSeconds?: string;
  fields?: PrescriptionField[];
};
export type CatalogExercise = {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string | null;
};
export function prescriptionDraft(row: { id: string } & SessionExerciseInput): PrescriptionDraft {
  return {
    id: row.id,
    exerciseId: row.exerciseId,
    sets: String(row.sets),
    repsMin: String(row.repsMin),
    repsMax: String(row.repsMax),
    targetWeightKg: row.targetWeightKg === null ? "" : String(row.targetWeightKg),
    note: row.note ?? "",
  };
}
export function validatePrescriptions(drafts: PrescriptionDraft[]) {
  const errors: Record<string, string> = {};
  const rows: ({ id: string } & SessionExerciseInput & {
      restSeconds?: number | null;
      supersetRestSeconds?: number | null;
      fields?: PrescriptionField[];
    })[] = [];
  if (
    drafts.length === 0 ||
    drafts.length > 15 ||
    new Set(drafts.map((r) => r.id)).size !== drafts.length
  ) {
    return { rows, errors, error: "Selecciona entre 1 y 15 ejercicios distintos." };
  }
  for (const draft of drafts) {
    const parsed = prescriptionMutationSchema.safeParse(draft);
    if (parsed.success) rows.push({ id: draft.id, ...parsed.data });
    else errors[draft.id] = parsed.error.issues.map((i) => i.message).join(". ");
  }
  return {
    rows,
    errors,
    error: Object.keys(errors).length
      ? "Revisa las prescripciones marcadas antes de guardar."
      : null,
  };
}
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export function searchExercises<T extends CatalogExercise>(
  catalog: T[],
  search: string,
  muscle: string,
): T[] {
  const needle = normalize(search);
  return catalog.filter(
    (e) =>
      (!muscle || e.muscleGroup === muscle) &&
      normalize(`${e.name} ${e.muscleGroup} ${e.equipment ?? ""}`).includes(needle),
  );
}
