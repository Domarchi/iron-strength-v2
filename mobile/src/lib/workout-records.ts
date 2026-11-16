import type { TrainingProgress } from "../../../src/domain/training-progress";

export type WorkoutRecord = {
  exerciseId: string;
  name: string;
  metric: string;
  value: number;
  previous: number;
};

const ORDER = ["weightKg", "estimated1RM", "reps", "durationSeconds", "distanceMeters"];

/** Marcas que este entrenamiento mejoró, por ejercicio; sale del progreso ya calculado. */
export function recordsOfWorkout(
  progress: Pick<TrainingProgress, "exercises">,
  workoutId: string,
): WorkoutRecord[] {
  const out: WorkoutRecord[] = [];
  for (const exercise of progress.exercises)
    for (const point of exercise.points)
      if (point.workoutId === workoutId)
        for (const r of point.records)
          out.push({
            exerciseId: exercise.exerciseId,
            name: exercise.name,
            metric: r.metric,
            value: r.value,
            previous: r.previous,
          });
  const rank = (m: string) => (ORDER.includes(m) ? ORDER.indexOf(m) : ORDER.length);
  return out.sort((a, b) => a.name.localeCompare(b.name) || rank(a.metric) - rank(b.metric));
}

const LABEL: Record<string, string> = {
  weightKg: "Más peso",
  estimated1RM: "1RM estimado",
  reps: "Más repeticiones",
  assistanceKg: "Menos asistencia",
  durationSeconds: "Más tiempo",
  distanceMeters: "Más distancia",
};
export const recordLabel = (metric: string) => LABEL[metric] ?? "Nueva marca";
