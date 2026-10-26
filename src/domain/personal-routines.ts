import { z } from "zod";
import { LIMITS } from "./limits";
import { MUSCLE_GROUPS } from "./schemas";
import { seriesSummary } from "./prescription-series";
import { exerciseBlocks, validRestSeconds, validSupersetLayout } from "./supersets";
import type { MobileCatalogEntry } from "../lib/mobile/exercise-contracts";
import type { PersonalItemInput, PersonalRoutine } from "../lib/mobile/personal-contracts";

const textNumber = z.string().max(20);
const editableSeries = z
  .object({ repsMin: textNumber, repsMax: textNumber, targetWeightKg: textNumber })
  .strict();
export const personalEditorItemSchema = z
  .object({
    id: z.uuid(),
    exerciseId: z.uuid(),
    name: z.string().min(1).max(100),
    muscleGroup: z.enum(MUSCLE_GROUPS),
    equipment: z.string().max(100).nullable(),
    isBodyweight: z.boolean(),
    progressionIncrementKg: z.number().positive().max(20),
    sets: textNumber,
    repsMin: textNumber,
    repsMax: textNumber,
    targetWeightKg: textNumber,
    note: z.string().max(500),
    restSeconds: textNumber,
    supersetId: z.uuid().nullable(),
    supersetRestSeconds: z.number().int().nullable(),
    series: z.array(editableSeries).min(1).max(10).nullable(),
  })
  .strict();
export type PersonalEditorItem = z.infer<typeof personalEditorItemSchema>;
export type PersonalBulkPatch = Partial<
  Pick<PersonalEditorItem, "sets" | "repsMin" | "repsMax" | "targetWeightKg" | "restSeconds">
>;
export function addPersonalExercise(exercise: MobileCatalogEntry, id: string): PersonalEditorItem {
  return {
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    equipment: exercise.equipment,
    isBodyweight: exercise.isBodyweight,
    progressionIncrementKg: exercise.progressionIncrementKg,
    exerciseId: exercise.id,
    id,
    sets: "3",
    repsMin: "8",
    repsMax: "12",
    targetWeightKg: "",
    note: "",
    restSeconds: "90",
    supersetId: null,
    supersetRestSeconds: null,
    series: null,
  };
}
export function clonePersonalItem(item: PersonalEditorItem): PersonalEditorItem {
  return { ...item, series: item.series?.map((target) => ({ ...target })) ?? null };
}
const raw = (n: number | null) => (n === null ? "" : String(n));
export function editablePersonalItems(routine: PersonalRoutine): PersonalEditorItem[] {
  return routine.items.map((item) => ({
    id: item.id,
    exerciseId: item.exerciseId,
    name: item.name,
    muscleGroup: item.muscleGroup,
    equipment: item.equipment,
    isBodyweight: item.isBodyweight,
    progressionIncrementKg: item.progressionIncrementKg,
    sets: raw(item.sets),
    repsMin: raw(item.repsMin),
    repsMax: raw(item.repsMax),
    targetWeightKg: raw(item.targetWeightKg),
    note: item.note,
    restSeconds: raw(item.restSeconds),
    supersetId: item.supersetId,
    supersetRestSeconds: item.supersetRestSeconds,
    series:
      item.series?.map((s) => ({
        repsMin: raw(s.repsMin),
        repsMax: raw(s.repsMax),
        targetWeightKg: raw(s.targetWeightKg),
      })) ?? null,
  }));
}
function number(text: string, min: number, max: number, integer: boolean, label: string): number {
  if (!/^\d+(?:[.,]\d{0,2})?$/.test(text.trim())) throw Error(`Revisa ${label}.`);
  const value = Number(text.trim().replace(",", "."));
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw Error(`Revisa ${label}.`);
  return value;
}
const weight = (text: string) =>
  text.trim() === "" ? null : number(text, 0, 500, false, "el peso (0–500 kg)");
export function personalItemInput(item: PersonalEditorItem): PersonalItemInput {
  if (item.note.length > 500) throw Error("La nota admite hasta 500 caracteres.");
  const target = (row: { repsMin: string; repsMax: string; targetWeightKg: string }) => {
    const repsMin = number(row.repsMin, 1, 100, true, `las repeticiones mínimas de ${item.name}`),
      repsMax = number(row.repsMax, 1, 100, true, `las repeticiones máximas de ${item.name}`);
    if (repsMin > repsMax) throw Error(`El mínimo supera al máximo en ${item.name}.`);
    return { repsMin, repsMax, targetWeightKg: weight(row.targetWeightKg) };
  };
  const series = item.series?.map(target) ?? null;
  const prescription = series
    ? seriesSummary(series)
    : { ...target(item), sets: number(item.sets, 1, 10, true, `las series de ${item.name}`) };
  const restSeconds =
    item.restSeconds.trim() === "" ? null : number(item.restSeconds, 0, 600, true, "el descanso");
  if (
    !validRestSeconds(restSeconds) ||
    !validRestSeconds(item.supersetRestSeconds) ||
    (!item.supersetId && item.supersetRestSeconds !== null)
  )
    throw Error("El descanso debe ser cero o entre 15 y 600 segundos.");
  return {
    id: item.id,
    exerciseId: item.exerciseId,
    ...prescription,
    note: item.note,
    restSeconds,
    supersetId: item.supersetId,
    supersetRestSeconds: item.supersetRestSeconds,
    series,
  };
}
export function personalItemsInput(items: PersonalEditorItem[]): PersonalItemInput[] {
  if (items.length > LIMITS.exercisesPerSession) throw Error("Máximo 15 ejercicios por rutina.");
  if (!validSupersetLayout(items))
    throw Error("Revisa las superseries: 2–4 ejercicios consecutivos y un descanso común.");
  return items.map(personalItemInput);
}
export function detailPersonalItem(item: PersonalEditorItem): PersonalEditorItem {
  if (item.series) return clonePersonalItem(item);
  const input = personalItemInput(item);
  return {
    ...item,
    series: Array.from({ length: input.sets }, () => ({
      repsMin: item.repsMin,
      repsMax: item.repsMax,
      targetWeightKg: item.targetWeightKg,
    })),
  };
}
export function simplifyPersonalItem(item: PersonalEditorItem): PersonalEditorItem {
  if (!item.series) return clonePersonalItem(item);
  return { ...item, ...item.series[0], sets: String(item.series.length), series: null };
}
export function groupPersonalItems(
  items: PersonalEditorItem[],
  selected: string[],
  groupId: string,
): PersonalEditorItem[] {
  const indices = items.flatMap((item, index) => (selected.includes(item.id) ? [index] : []));
  if (
    new Set(selected).size !== selected.length ||
    indices.length !== selected.length ||
    indices.length < 2 ||
    indices.length > 4 ||
    indices.at(-1)! - indices[0] + 1 !== indices.length ||
    indices.some((index) => items[index].supersetId !== null)
  )
    throw Error("Selecciona 2–4 ejercicios consecutivos que no estén agrupados.");
  return items.map((item) =>
    selected.includes(item.id) ? { ...item, supersetId: groupId, supersetRestSeconds: 90 } : item,
  );
}
export function ungroupPersonalItems(
  items: PersonalEditorItem[],
  groupId: string,
): PersonalEditorItem[] {
  return items.map((item) =>
    item.supersetId === groupId ? { ...item, supersetId: null, supersetRestSeconds: null } : item,
  );
}
export function removePersonalItem(items: PersonalEditorItem[], id: string): PersonalEditorItem[] {
  const result = items.filter((item) => item.id !== id);
  return result.map((item) =>
    item.supersetId && result.filter((r) => r.supersetId === item.supersetId).length === 1
      ? { ...item, supersetId: null, supersetRestSeconds: null }
      : item,
  );
}
export function detachPersonalItem(items: PersonalEditorItem[], id: string): PersonalEditorItem[] {
  const item = items.find((row) => row.id === id);
  if (!item?.supersetId) return items;
  const others = removePersonalItem(items, id),
    groupEnd = others.findLastIndex((row) => row.supersetId === item.supersetId);
  // Keep any remaining group together; detached item goes immediately after it.
  const index =
    groupEnd >= 0
      ? groupEnd + 1
      : Math.min(
          items.findIndex((row) => row.id === id),
          others.length,
        );
  return [
    ...others.slice(0, index),
    { ...item, supersetId: null, supersetRestSeconds: null },
    ...others.slice(index),
  ];
}
export function duplicatePersonalItem(
  items: PersonalEditorItem[],
  id: string,
  newId: string,
): PersonalEditorItem[] {
  if (items.length >= 15) throw Error("Máximo 15 ejercicios por rutina.");
  const item = items.find((row) => row.id === id);
  if (!item) throw Error("El ejercicio ya no está en esta rutina.");
  const end = item.supersetId
    ? items.findLastIndex((row) => row.supersetId === item.supersetId)
    : items.findIndex((row) => row.id === id);
  return [
    ...items.slice(0, end + 1),
    { ...clonePersonalItem(item), id: newId, supersetId: null, supersetRestSeconds: null },
    ...items.slice(end + 1),
  ];
}
export function personalEditorBlocks(items: PersonalEditorItem[]) {
  // Keep the group visible while its numeric rest field is temporarily invalid.
  return exerciseBlocks(items.map((item) => ({ ...item, supersetRestSeconds: null }))).map(
    (block) => ({
      ...block,
      exercises: block.exercises.map((row) => items.find((item) => item.id === row.id)!),
    }),
  );
}
export function movePersonalBlock(
  items: PersonalEditorItem[],
  id: string,
  direction: -1 | 1,
): PersonalEditorItem[] {
  if (!validSupersetLayout(items)) throw Error("Revisa la superserie antes de moverla.");
  const blocks = exerciseBlocks(items),
    index = blocks.findIndex((block) => block.exercises.some((item) => item.id === id));
  const to = index + direction;
  if (index < 0 || to < 0 || to >= blocks.length) return items;
  [blocks[index], blocks[to]] = [blocks[to], blocks[index]];
  return blocks.flatMap((block) => block.exercises);
}
export function patchPersonalItems(
  items: PersonalEditorItem[],
  selected: string[],
  patch: PersonalBulkPatch,
): PersonalEditorItem[] {
  const result = items.map((item) => {
    if (!selected.includes(item.id)) return item;
    const updated = { ...item, ...patch };
    if (item.series) {
      const count =
        patch.sets === undefined
          ? item.series.length
          : number(patch.sets, 1, 10, true, "las series");
      updated.series = Array.from({ length: count }, (_, index) => {
        const previous = item.series![Math.min(index, item.series!.length - 1)];
        return {
          repsMin: patch.repsMin ?? previous.repsMin,
          repsMax: patch.repsMax ?? previous.repsMax,
          targetWeightKg: patch.targetWeightKg ?? previous.targetWeightKg,
        };
      });
    }
    return updated;
  });
  personalItemsInput(result);
  return result;
}
export function forkPersonalItems(
  items: PersonalEditorItem[],
  uuid: () => string,
): PersonalEditorItem[] {
  const groups = new Map<string, string>();
  return items.map((item) => {
    let groupId: string | null = null;
    if (item.supersetId) {
      groupId = groups.get(item.supersetId) ?? uuid();
      groups.set(item.supersetId, groupId);
    }
    return { ...clonePersonalItem(item), id: uuid(), supersetId: groupId };
  });
}
