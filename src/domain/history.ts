// "Última vez" de cada ejercicio (RF-20) y último peso usado (DC-9), a partir del historial reciente.
import { santiagoDate, type DateString } from "./dates";

export type HistorySet = { exerciseId: string; weightKg: number; reps: number; isWarmup: boolean };
export type HistoryWorkout = { id: string; startedAt: string; sets: HistorySet[] };

export type LastPerformance = {
  workoutId: string;
  date: DateString;
  sets: { weightKg: number; reps: number; isWarmup: boolean }[];
  topWeightKg: number; // mayor peso de las series de trabajo (sin calentamiento)
};

export function lastByExercise(workouts: HistoryWorkout[]): Map<string, LastPerformance> {
  const result = new Map<string, LastPerformance>();
  const newestFirst = [...workouts].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  for (const workout of newestFirst) {
    const byExercise = new Map<string, HistorySet[]>();
    for (const set of workout.sets) {
      byExercise.set(set.exerciseId, [...(byExercise.get(set.exerciseId) ?? []), set]);
    }
    for (const [exerciseId, sets] of byExercise) {
      if (result.has(exerciseId)) continue;
      const working = sets.filter((s) => !s.isWarmup);
      if (working.length === 0) continue; // solo calentamiento: no cuenta como "última vez"
      result.set(exerciseId, {
        workoutId: workout.id,
        date: santiagoDate(new Date(workout.startedAt)),
        sets: sets.map(({ weightKg, reps, isWarmup }) => ({ weightKg, reps, isWarmup })),
        topWeightKg: Math.max(...working.map((s) => s.weightKg)),
      });
    }
  }
  return result;
}
