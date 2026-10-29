import { z } from "zod";
import {
  applyCoachPrescriptionChanges,
  coachPrescriptionChangesSchema,
  type CoachPrescriptionChanges,
} from "@/domain/coach-session-mutation";
import {
  parsePrescriptionInput,
  prescriptionInputFields,
  prescriptionInputSchema,
  prescriptionToInput,
  type PrescriptionInput,
} from "@/domain/prescription-input";
import type { TrainingPrescription } from "@/domain/training-metrics";

export type CoachPrescriptionRow = {
  id: string;
  exerciseId: string;
  prescribed: TrainingPrescription;
  note: string | null;
  restSeconds: number | null;
  supersetId: string | null;
  supersetRestSeconds: number | null;
};
const targetKeys = [
  "repsMin",
  "repsMax",
  "targetWeightKg",
  "targetDurationSeconds",
  "targetDistanceMeters",
] as const;
const scalarKeys = ["sets", ...targetKeys] as const;
type ScalarKey = (typeof scalarKeys)[number];
const shape = coachPrescriptionChangesSchema.shape;
const scalarChangesSchema = z
  .object({
    sets: shape.sets,
    repsMin: shape.repsMin,
    repsMax: shape.repsMax,
    targetWeightKg: shape.targetWeightKg,
    targetDurationSeconds: shape.targetDurationSeconds,
    targetDistanceMeters: shape.targetDistanceMeters,
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0 && Object.values(value).every((v) => v !== undefined),
  );
export const coachRowEditSchema = z
  .object({
    id: z.uuid(),
    exerciseId: z.uuid(),
    targets: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("replace"), input: prescriptionInputSchema }).strict(),
        z.object({ kind: z.literal("patch"), changes: scalarChangesSchema }).strict(),
      ])
      .optional(),
    // Partial text remains valid local input; only preparation enforces the remote limits.
    note: z.string().optional(),
    restSeconds: z.string().optional(),
    supersetRestSeconds: z.string().optional(),
  })
  .strict()
  .refine(
    (value) => Object.values(value).every((v) => v !== undefined) && Object.keys(value).length > 2,
  );
export type CoachRowEdit = z.infer<typeof coachRowEditSchema>;

function checkedEdit(row: CoachPrescriptionRow, input: unknown): CoachRowEdit {
  const edit = coachRowEditSchema.parse(input);
  if (
    edit.id.toLowerCase() !== row.id.toLowerCase() ||
    edit.exerciseId.toLowerCase() !== row.exerciseId.toLowerCase()
  )
    throw Error("El ejercicio cambió. Revisa tus cambios antes de guardarlos.");
  if (
    edit.targets?.kind === "replace" &&
    edit.targets.input.recordType !== row.prescribed.recordType
  )
    throw Error("El tipo del ejercicio no se puede cambiar.");
  return edit;
}
/** The input is not prepared here: invalid/partial text must remain editable and recoverable. */
export function effectiveCoachGoals(
  row: CoachPrescriptionRow,
  input?: CoachRowEdit,
): PrescriptionInput {
  if (!input) return prescriptionToInput(row.prescribed);
  const edit = checkedEdit(row, input);
  if (edit.targets?.kind === "replace") return edit.targets.input;
  return prescriptionToInput(
    edit.targets?.kind === "patch"
      ? applyCoachPrescriptionChanges(row.prescribed, edit.targets.changes)
      : row.prescribed,
  );
}
function numeric(text: string, integer: boolean): number {
  const trimmed = text.trim();
  if (!(integer ? /^\d+$/ : /^(?:\d+(?:[.,]\d{1,2})?|[.,]\d{1,2})$/).test(trimmed))
    throw Error("Completa los valores sin exponentes ni separadores de miles.");
  return Number(trimmed.replace(",", "."));
}
function restValue(text: string): number | null {
  return shape.restSeconds.unwrap().parse(text.trim() === "" ? null : numeric(text, true));
}
/** Explicit fields are preserved on the wire; metadata alone never rewrites a prescription. */
export function prepareCoachRowChanges(
  row: CoachPrescriptionRow,
  input: unknown,
): CoachPrescriptionChanges {
  const edit = checkedEdit(row, input);
  const changes: CoachPrescriptionChanges = {};
  if (edit.targets?.kind === "replace")
    changes.prescribed = parsePrescriptionInput(edit.targets.input);
  if (edit.targets?.kind === "patch") {
    applyCoachPrescriptionChanges(row.prescribed, edit.targets.changes);
    Object.assign(changes, edit.targets.changes);
  }
  if (edit.note !== undefined) changes.note = edit.note === "" ? null : edit.note;
  if (edit.restSeconds !== undefined) changes.restSeconds = restValue(edit.restSeconds);
  if (edit.supersetRestSeconds !== undefined)
    changes.supersetRestSeconds = restValue(edit.supersetRestSeconds);
  return coachPrescriptionChangesSchema.parse(changes);
}
export function commonCoachFields(rows: CoachPrescriptionRow[]): ScalarKey[] {
  if (!rows.length) return [];
  return scalarKeys.filter(
    (key) =>
      key === "sets" ||
      rows.every((row) => prescriptionInputFields(row.prescribed.recordType).includes(key)),
  );
}
const rawField = z.string().max(30).optional();
export const coachBulkFieldsSchema = z
  .object({
    sets: rawField,
    repsMin: rawField,
    repsMax: rawField,
    targetWeightKg: rawField,
    targetDurationSeconds: rawField,
    targetDistanceMeters: rawField,
    restSeconds: rawField,
  })
  .strict()
  .refine((value) => Object.values(value).every((v) => v !== undefined));
export const coachBulkInputSchema = z
  .object({
    ids: z
      .array(z.uuid())
      .min(1)
      .max(15)
      .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length),
    fields: coachBulkFieldsSchema.refine((value) => Object.keys(value).length > 0),
  })
  .strict();
export type CoachBulkInput = z.infer<typeof coachBulkInputSchema>;
export type CoachBulkRow = {
  id: string;
  exerciseId: string;
  changes: CoachPrescriptionChanges;
  prescribed: TrainingPrescription;
};
export function buildCoachBulkPreview(
  rows: CoachPrescriptionRow[],
  input: unknown,
): { ok: true; rows: CoachBulkRow[] } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const parsed = coachBulkInputSchema.safeParse(input);
  if (!parsed.success) return fail("Selecciona ejercicios y completa los campos del lote.");
  const { ids, fields } = parsed.data;
  const wanted = new Set(ids.map((id) => id.toLowerCase()));
  const selected = rows.filter((row) => wanted.has(row.id.toLowerCase()));
  if (selected.length !== ids.length)
    return fail("La selección cambió. Revisa los ejercicios de esta sesión.");
  const common = commonCoachFields(selected);
  if (scalarKeys.some((key) => Object.hasOwn(fields, key) && !common.includes(key)))
    return fail("Elige solo dimensiones comunes a los ejercicios seleccionados.");
  if (
    fields.restSeconds !== undefined &&
    selected.some(
      (row) =>
        row.supersetId &&
        rows.some(
          (member) => member.supersetId === row.supersetId && !wanted.has(member.id.toLowerCase()),
        ),
    )
  )
    return fail("Selecciona todos los integrantes de cada superserie para cambiar su descanso.");
  try {
    const patch: CoachPrescriptionChanges = {};
    for (const key of scalarKeys) {
      const text = fields[key];
      if (text === undefined) continue;
      const optional = key !== "sets" && key !== "repsMin" && key !== "repsMax";
      const value =
        optional && text.trim() === ""
          ? null
          : numeric(
              text,
              key === "sets" ||
                key === "repsMin" ||
                key === "repsMax" ||
                key === "targetDurationSeconds",
            );
      Object.assign(patch, { [key]: value });
    }
    const changes = selected.map((row) => {
      const chosen = { ...patch };
      if (fields.restSeconds !== undefined)
        chosen[row.supersetId ? "supersetRestSeconds" : "restSeconds"] = restValue(
          fields.restSeconds,
        );
      const valid = coachPrescriptionChangesSchema.parse(chosen);
      return {
        id: row.id,
        exerciseId: row.exerciseId,
        changes: valid,
        prescribed: applyCoachPrescriptionChanges(row.prescribed, valid),
      };
    });
    return { ok: true, rows: changes };
  } catch {
    return fail("Revisa los límites, el rango de repeticiones y los descansos antes de aplicar.");
  }
}
