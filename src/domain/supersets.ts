// Grupos de rutina. La identidad de un grupo pertenece a su sesión.
export type GroupedExercise = {
  id: string;
  name: string;
  supersetId?: string | null;
  supersetRestSeconds?: number | null;
};
export function validRestSeconds(value: number | null | undefined): boolean {
  return value == null || value === 0 || (Number.isInteger(value) && value >= 15 && value <= 600);
}
export function validSupersetLayout(rows: GroupedExercise[]): boolean {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) return false;
  const groups = new Map<
    string,
    { first: number; last: number; count: number; rest: number | null }
  >();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index],
      rest = row.supersetRestSeconds ?? null;
    if (!validRestSeconds(rest) || (!row.supersetId && rest !== null)) return false;
    if (!row.supersetId) continue;
    const group = groups.get(row.supersetId);
    if (group) {
      if (group.rest !== rest) return false;
      group.last = index;
      group.count++;
    } else groups.set(row.supersetId, { first: index, last: index, count: 1, rest });
  }
  return [...groups.values()].every(
    (group) => group.count >= 2 && group.count <= 4 && group.last - group.first + 1 === group.count,
  );
}
export type ExerciseBlock<T> = {
  id: string;
  name: string;
  supersetId: string | null;
  exercises: T[];
};
export function exerciseBlocks<T extends GroupedExercise>(rows: T[]): ExerciseBlock<T>[] {
  const valid = validSupersetLayout(rows);
  const blocks: ExerciseBlock<T>[] = [];
  let groupNumber = 0;
  for (const row of rows) {
    const groupId = valid ? (row.supersetId ?? null) : null;
    const last = blocks.at(-1);
    if (groupId && last?.supersetId === groupId) last.exercises.push(row);
    else
      blocks.push({
        id: groupId ? `superset:${groupId}` : row.id,
        name: groupId ? `Superserie ${++groupNumber}` : row.name,
        supersetId: groupId,
        exercises: [row],
      });
  }
  return blocks;
}
