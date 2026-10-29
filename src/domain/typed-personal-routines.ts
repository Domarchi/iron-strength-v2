import { z } from "zod";
import {
  personalEditorItemSchema,
  clonePersonalItem,
  type PersonalEditorItem,
} from "./personal-routines";
import {
  trainingPrescriptionSchema,
  trainingTargetSummary,
  type RecordType,
  type TrainingTarget,
} from "./training-metrics";
import { validRestSeconds, validSupersetLayout } from "./supersets";
import {
  typedPersonalItemSchema,
  type TypedPersonalItemInput,
  type TypedPersonalRoutine,
} from "../lib/mobile/typed-personal-contracts";
import type { TypedCatalogEntry } from "../lib/mobile/typed-exercise-contracts";
const text = z.string().max(20);
const targetFields = {
  repsMin: text,
  repsMax: text,
  targetWeightKg: text,
  targetDurationSeconds: text,
  targetDistanceMeters: text,
};
const targetSchema = z.object(targetFields).strict();
export type TypedEditableTarget = z.infer<typeof targetSchema>;
export const typedPersonalEditorItemSchema = personalEditorItemSchema
  .extend({
    recordType: trainingPrescriptionSchema.shape.recordType,
    targetDurationSeconds: text,
    targetDistanceMeters: text,
    note: z.string().refine((v) => Array.from(v).length <= 500),
    series: z.array(targetSchema).min(1).max(10).nullable(),
  })
  .strict();
export type TypedPersonalEditorItem = z.infer<typeof typedPersonalEditorItemSchema>;
export type TypedPersonalBulkPatch = Partial<
  Pick<TypedPersonalEditorItem, "sets" | "restSeconds" | keyof TypedEditableTarget>
>;
export function personalTargetFields(kind: RecordType): (keyof TypedEditableTarget)[] {
  const k = kind ?? "weight_reps",
    fields: (keyof TypedEditableTarget)[] = [];
  if (k.includes("reps") || k.includes("bodyweight")) fields.push("repsMin", "repsMax");
  if (k.startsWith("weight_") || k === "weighted_bodyweight" || k === "assisted_bodyweight")
    fields.push("targetWeightKg");
  if (k.includes("duration")) fields.push("targetDurationSeconds");
  if (k.includes("distance")) fields.push("targetDistanceMeters");
  return fields;
}
export function addTypedPersonalExercise(
  exercise: TypedCatalogEntry,
  id: string,
): TypedPersonalEditorItem {
  const fields = personalTargetFields(exercise.recordType);
  return typedPersonalEditorItemSchema.parse({
    id,
    exerciseId: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    equipment: exercise.equipment,
    isBodyweight: exercise.isBodyweight,
    progressionIncrementKg: exercise.progressionIncrementKg,
    recordType: exercise.recordType,
    sets: "3",
    repsMin: fields.includes("repsMin") ? "8" : "",
    repsMax: fields.includes("repsMax") ? "12" : "",
    targetWeightKg: "",
    targetDurationSeconds: "",
    targetDistanceMeters: "",
    note: "",
    restSeconds: "90",
    supersetId: null,
    supersetRestSeconds: null,
    series: null,
  });
}
export function upgradePersonalEditorItem(input: PersonalEditorItem): TypedPersonalEditorItem {
  const item = personalEditorItemSchema.parse(input);
  return typedPersonalEditorItemSchema.parse({
    ...item,
    recordType: null,
    targetDurationSeconds: "",
    targetDistanceMeters: "",
    series:
      item.series?.map((t) => ({ ...t, targetDurationSeconds: "", targetDistanceMeters: "" })) ??
      null,
  });
}
const raw = (n: number | null) => (n === null ? "" : String(n));
const editableTarget = (t: TrainingTarget): TypedEditableTarget => ({
  repsMin: raw(t.repsMin),
  repsMax: raw(t.repsMax),
  targetWeightKg: raw(t.targetWeightKg),
  targetDurationSeconds: raw(t.targetDurationSeconds),
  targetDistanceMeters: raw(t.targetDistanceMeters),
});
export function editableTypedPersonalItems(base: TypedPersonalRoutine): TypedPersonalEditorItem[] {
  return base.items.map((item) =>
    typedPersonalEditorItemSchema.parse({
      id: item.id,
      exerciseId: item.exerciseId,
      name: item.name,
      muscleGroup: item.muscleGroup,
      equipment: item.equipment,
      isBodyweight: item.isBodyweight,
      progressionIncrementKg: item.progressionIncrementKg,
      recordType: item.prescribed.recordType,
      sets: String(item.prescribed.sets),
      ...editableTarget(item.prescribed.target),
      series: item.prescribed.series?.map(editableTarget) ?? null,
      note: item.note,
      restSeconds: raw(item.restSeconds),
      supersetId: item.supersetId,
      supersetRestSeconds: item.supersetRestSeconds,
    }),
  );
}
function numeric(text: string, min: number, max: number, integer = false): number {
  if (!/^\d+(?:[.,]\d{0,2})?$/.test(text.trim())) throw Error("Revisa los objetivos de la rutina.");
  const n = Number(text.trim().replace(",", "."));
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n)))
    throw Error("Revisa los límites de los objetivos.");
  return n;
}
function target(item: TypedEditableTarget, kind: RecordType): TrainingTarget {
  const allowed = personalTargetFields(kind);
  for (const key of Object.keys(targetFields) as (keyof TypedEditableTarget)[])
    if (!allowed.includes(key) && item[key].trim() !== "")
      throw Error("Hay un objetivo que no corresponde al tipo de ejercicio.");
  const optional = (key: keyof TypedEditableTarget, min: number, max: number, int = false) =>
    item[key].trim() === "" ? null : numeric(item[key], min, max, int);
  return {
    repsMin: allowed.includes("repsMin") ? numeric(item.repsMin, 1, 100, true) : null,
    repsMax: allowed.includes("repsMax") ? numeric(item.repsMax, 1, 100, true) : null,
    targetWeightKg: optional("targetWeightKg", 0, 500),
    targetDurationSeconds: optional("targetDurationSeconds", 1, 86400, true),
    targetDistanceMeters: optional("targetDistanceMeters", 0.01, 1000000),
  };
}
export function typedPersonalItemInput(value: TypedPersonalEditorItem): TypedPersonalItemInput {
  const parsed = typedPersonalEditorItemSchema.safeParse(value);
  if (!parsed.success) throw Error("Revisa los campos y la nota del ejercicio.");
  const item = parsed.data,
    series = item.series?.map((t) => target(t, item.recordType)) ?? null;
  const checked = trainingPrescriptionSchema.safeParse({
    recordType: item.recordType,
    sets: series?.length ?? numeric(item.sets, 1, 10, true),
    target: series ? trainingTargetSummary(series) : target(item, item.recordType),
    series,
  });
  if (!checked.success) throw Error(`Revisa los objetivos y las series de ${item.name}.`);
  const prescribed = checked.data;
  const restSeconds =
    item.restSeconds.trim() === "" ? null : numeric(item.restSeconds, 0, 600, true);
  if (
    !validRestSeconds(restSeconds) ||
    !validRestSeconds(item.supersetRestSeconds) ||
    (!item.supersetId && item.supersetRestSeconds !== null)
  )
    throw Error("El descanso debe ser cero o entre 15 y 600 segundos.");
  return typedPersonalItemSchema.parse({
    id: item.id,
    exerciseId: item.exerciseId,
    prescribed,
    note: item.note,
    restSeconds,
    supersetId: item.supersetId,
    supersetRestSeconds: item.supersetRestSeconds,
  });
}
export function typedPersonalItemsInput(
  items: TypedPersonalEditorItem[],
): TypedPersonalItemInput[] {
  if (items.length > 15) throw Error("Máximo 15 ejercicios por rutina.");
  if (!validSupersetLayout(items))
    throw Error("Revisa las superseries: 2–4 ejercicios consecutivos y un descanso común.");
  return items.map(typedPersonalItemInput);
}
export function detailTypedPersonalItem(item: TypedPersonalEditorItem): TypedPersonalEditorItem {
  if (item.series) return clonePersonalItem(item);
  const input = typedPersonalItemInput(item),
    t = editableTarget(input.prescribed.target);
  return { ...item, series: Array.from({ length: input.prescribed.sets }, () => ({ ...t })) };
}
export function simplifyTypedPersonalItem(item: TypedPersonalEditorItem): TypedPersonalEditorItem {
  if (!item.series) return clonePersonalItem(item);
  return { ...item, ...item.series[0], sets: String(item.series.length), series: null };
}
export function patchTypedPersonalItems(
  items: TypedPersonalEditorItem[],
  selected: string[],
  patch: TypedPersonalBulkPatch,
): TypedPersonalEditorItem[] {
  const result = items.map((item) => {
    if (!selected.includes(item.id)) return item;
    const fields = personalTargetFields(item.recordType);
    for (const key of Object.keys(targetFields) as (keyof TypedEditableTarget)[])
      if (patch[key] !== undefined && !fields.includes(key))
        throw Error("La selección tiene tipos distintos. Cambia solo sus campos comunes.");
    const updated = { ...item, ...patch };
    if (item.series) {
      const count =
        patch.sets === undefined ? item.series.length : numeric(patch.sets, 1, 10, true);
      updated.series = Array.from({ length: count }, (_, i) => {
        const previous = item.series![Math.min(i, item.series!.length - 1)],
          next = { ...previous };
        for (const key of Object.keys(targetFields) as (keyof TypedEditableTarget)[])
          if (patch[key] !== undefined) next[key] = patch[key];
        return next;
      });
    }
    return updated;
  });
  typedPersonalItemsInput(result);
  return result;
}
