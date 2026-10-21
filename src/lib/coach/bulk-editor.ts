import { z } from "zod";
import { patchSeriesDraft, seriesDraftSummary } from "./series-draft";
import { prescriptionRestSchema, type PrescriptionField } from "@/domain/schemas";
import type { SessionExerciseRow } from "@/lib/data/programs";
import { prescriptionDraft, validatePrescriptions, type PrescriptionDraft } from "./routine-editor";
export const bulkDraftSchema = z.object({
  ids: z.array(z.string()).max(15),
  setsEnabled: z.boolean(),
  repsEnabled: z.boolean(),
  restEnabled: z.boolean(),
  sets: z.string(),
  repsMin: z.string(),
  repsMax: z.string(),
  restSeconds: z.string(),
});
export type BulkDraft = z.infer<typeof bulkDraftSchema>;
export const defaultBulkDraft = (ids: string[]): BulkDraft => ({
  ids,
  setsEnabled: false,
  repsEnabled: false,
  restEnabled: false,
  sets: "3",
  repsMin: "8",
  repsMax: "12",
  restSeconds: "90",
});
export function effectivePrescription(
  row: SessionExerciseRow,
  edit?: PrescriptionDraft,
): PrescriptionDraft {
  const base = prescriptionDraft(row);
  if (!edit) return base;
  const next = edit.fields ? { ...base, fields: edit.fields } : { ...edit };
  if (edit.fields)
    for (const field of edit.fields) {
      if (field === "series") {
        if (edit.series !== undefined) next.series = edit.series;
      } else {
        const value = edit[field];
        if (value !== undefined) next[field] = value;
      }
    }
  const explicitSeries = edit.fields ? edit.fields.includes("series") : edit.series !== undefined;
  if (row.series && !explicitSeries) {
    const fields =
      edit.fields ??
      (["sets", "repsMin", "repsMax", "targetWeightKg"] as const).filter(
        (f) => edit[f] !== base[f],
      );
    next.series = patchSeriesDraft(row.series, next, fields);
    const summary = seriesDraftSummary(next.series);
    if (summary) Object.assign(next, summary);
  }
  return next;
}
export function buildBulkPreview(
  rows: SessionExerciseRow[],
  draft: BulkDraft,
): { ok: true; changes: PrescriptionDraft[] } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (
    !draft.ids.length ||
    draft.ids.length > 15 ||
    new Set(draft.ids).size !== draft.ids.length ||
    draft.ids.some((id) => !rows.some((r) => r.id === id))
  )
    return fail("Selecciona entre 1 y 15 ejercicios de esta sesión.");
  if (!draft.setsEnabled && !draft.repsEnabled && !draft.restEnabled)
    return fail("Elige qué campos quieres cambiar.");
  const selected = rows.filter((r) => draft.ids.includes(r.id));
  if (
    draft.restEnabled &&
    selected.some(
      (r) =>
        r.supersetId &&
        rows.some((member) => member.supersetId === r.supersetId && !draft.ids.includes(member.id)),
    )
  )
    return fail("Selecciona todos los integrantes de cada superserie para cambiar su descanso.");
  if (draft.restEnabled && !prescriptionRestSchema.safeParse(draft.restSeconds).success)
    return fail("El descanso debe ser libre, 0 o entre 15 y 600 segundos.");
  const changes = selected.map((row) => {
    const next = prescriptionDraft(row);
    const fields: PrescriptionField[] = [];
    if (draft.setsEnabled) {
      next.sets = draft.sets;
      fields.push("sets");
    }
    if (draft.repsEnabled) {
      next.repsMin = draft.repsMin;
      next.repsMax = draft.repsMax;
      fields.push("repsMin", "repsMax");
    }
    if (draft.restEnabled) {
      const field = row.supersetId ? "supersetRestSeconds" : "restSeconds";
      next[field] = draft.restSeconds;
      fields.push(field);
    }
    return effectivePrescription(row, { ...next, fields });
  });
  const validation = validatePrescriptions(changes);
  return validation.error
    ? fail("Revisa las series y el rango de repeticiones antes de aplicar.")
    : { ok: true, changes };
}
