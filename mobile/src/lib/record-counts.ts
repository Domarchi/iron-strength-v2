import type { TrainingProgress } from "../../../src/domain/training-progress";

/** Marcas mejoradas por entrenamiento: sale de los puntos de cada ejercicio, sin nuevas consultas. */
export function recordCountsByWorkout(
  progress: Pick<TrainingProgress, "exercises">,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const exercise of progress.exercises)
    for (const point of exercise.points)
      if (point.records.length)
        counts.set(point.workoutId, (counts.get(point.workoutId) ?? 0) + point.records.length);
  return counts;
}
