import {
  exerciseBlocks,
  validRestSeconds,
  validSupersetLayout,
  type GroupedExercise,
} from "./supersets";

export type ExerciseLayout = readonly Readonly<GroupedExercise>[];
function check(rows: ExerciseLayout) {
  if (rows.length > 15) throw Error("Máximo 15 ejercicios por entrenamiento.");
  if (!validSupersetLayout([...rows]))
    throw Error("Revisa el orden y las superseries antes de modificar ejercicios.");
}
function findRow(rows: ExerciseLayout, id: string) {
  const index = rows.findIndex((r) => r.id === id);
  if (index < 0) throw Error("Ese ejercicio ya no está en este entrenamiento.");
  return index;
}
function findGroup(rows: ExerciseLayout, id: string) {
  if (!rows.some((r) => r.supersetId === id))
    throw Error("Esa superserie ya no está en este entrenamiento.");
}
const clearGroup = (row: Readonly<GroupedExercise>): GroupedExercise => ({
  ...row,
  supersetId: null,
  supersetRestSeconds: null,
});

/** Anchors identify whole blocks. A missing drop target cancels without changing their members. */
export function reorderExerciseBlocks(
  rows: ExerciseLayout,
  fromId: string,
  toId: string | null,
): ExerciseLayout {
  check(rows);
  if (toId === null) return rows;
  const blocks = exerciseBlocks([...rows]);
  const index = (id: string) =>
    blocks.findIndex((b) => b.id === id || b.exercises.some((r) => r.id === id));
  const from = index(fromId),
    to = index(toId);
  if (from < 0 || to < 0 || from === to) return rows;
  const [moving] = blocks.splice(from, 1);
  blocks.splice(to, 0, moving);
  return blocks.flatMap((b) => b.exercises);
}

export function groupExerciseLayout(
  rows: ExerciseLayout,
  selected: readonly string[],
  groupId: string,
  restSeconds: number | null = 90,
): ExerciseLayout {
  check(rows);
  const ids = new Set(selected),
    indices = rows.flatMap((r, i) => (ids.has(r.id) ? [i] : []));
  if (
    ids.size !== selected.length ||
    indices.length !== selected.length ||
    indices.length < 2 ||
    indices.length > 4 ||
    indices.at(-1)! - indices[0] + 1 !== indices.length ||
    indices.some((i) => rows[i].supersetId) ||
    !groupId.trim() ||
    rows.some((r) => r.supersetId === groupId)
  )
    throw Error("Selecciona 2–4 ejercicios consecutivos sin agrupar y una superserie nueva.");
  if (!validRestSeconds(restSeconds))
    throw Error("El descanso debe ser cero o entre 15 y 600 segundos.");
  return rows.map((r) =>
    ids.has(r.id) ? { ...r, supersetId: groupId, supersetRestSeconds: restSeconds } : r,
  );
}

export function ungroupExerciseLayout(rows: ExerciseLayout, groupId: string): ExerciseLayout {
  check(rows);
  findGroup(rows, groupId);
  return rows.map((r) => (r.supersetId === groupId ? clearGroup(r) : r));
}

export function removeExerciseLayout(rows: ExerciseLayout, id: string): ExerciseLayout {
  check(rows);
  const index = findRow(rows, id),
    groupId = rows[index].supersetId;
  const remaining = rows.filter((r) => r.id !== id);
  if (!groupId || remaining.filter((r) => r.supersetId === groupId).length !== 1) return remaining;
  return remaining.map((r) => (r.supersetId === groupId ? clearGroup(r) : r));
}

export function detachExerciseLayout(rows: ExerciseLayout, id: string): ExerciseLayout {
  check(rows);
  const index = findRow(rows, id),
    item = rows[index];
  if (!item.supersetId) return rows;
  const others = removeExerciseLayout(rows, id),
    end = others.findLastIndex((r) => r.supersetId === item.supersetId);
  const insert = end >= 0 ? end + 1 : Math.min(index, others.length);
  return [...others.slice(0, insert), clearGroup(item), ...others.slice(insert)];
}

export function setExerciseGroupRest(
  rows: ExerciseLayout,
  groupId: string,
  seconds: number | null,
): ExerciseLayout {
  check(rows);
  findGroup(rows, groupId);
  if (!validRestSeconds(seconds))
    throw Error("El descanso debe ser cero o entre 15 y 600 segundos.");
  return rows.map((r) => (r.supersetId === groupId ? { ...r, supersetRestSeconds: seconds } : r));
}

export function reorderGroupMembers(
  rows: ExerciseLayout,
  groupId: string,
  orderedIds: readonly string[],
): ExerciseLayout {
  check(rows);
  findGroup(rows, groupId);
  const members = rows.filter((r) => r.supersetId === groupId);
  const byId = new Map(members.map((r) => [r.id, r]));
  if (
    orderedIds.length !== members.length ||
    new Set(orderedIds).size !== members.length ||
    orderedIds.some((id) => !byId.has(id))
  )
    throw Error("El orden debe contener todos los integrantes de esta superserie una sola vez.");
  if (members.every((r, index) => r.id === orderedIds[index])) return rows;
  let index = 0;
  return rows.map((r) => (r.supersetId === groupId ? byId.get(orderedIds[index++])! : r));
}
