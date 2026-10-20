// La ronda es el ordinal de la serie de trabajo, no el índice que incluye calentamientos.
// Se deriva de las series: recuperar, deshacer o quitar una serie no necesita otro cursor mutable.
export type RoundExercise = {
  supersetId?: string | null;
  skipped: boolean;
  sets: { done: boolean; isWarmup: boolean }[];
};
export type RoundTarget = { exerciseIndex: number; setIndex: number; round: number };

export function nextSupersetSet(rows: RoundExercise[], groupId: string): RoundTarget | null {
  let target: RoundTarget | null = null;
  rows.forEach((exercise, exerciseIndex) => {
    if (exercise.supersetId !== groupId || exercise.skipped) return;
    let round = 0;
    exercise.sets.forEach((set, setIndex) => {
      if (set.isWarmup) return;
      if (!set.done && (target === null || round < target.round))
        target = { exerciseIndex, setIndex, round };
      round++;
    });
  });
  return target;
}

export function finishedSupersetRound(
  before: RoundExercise[],
  after: RoundExercise[],
  groupId: string,
): boolean {
  const previous = nextSupersetSet(before, groupId),
    next = nextSupersetSet(after, groupId);
  return previous !== null && (next === null || next.round > previous.round);
}
