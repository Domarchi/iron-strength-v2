// Volumen y series de progreso (DC-16, RF-30, RF-32). El volumen son los kilos totales movidos
// (peso × repeticiones) en series de trabajo; el peso corporal se cuenta aparte, en repeticiones,
// para no mezclar unidades. El calentamiento nunca cuenta.
import type { DateString } from "./dates";
import { estimated1RM } from "./records";

export type VolumeSet = { weightKg: number; reps: number; isWarmup: boolean };

export function setVolume(sets: VolumeSet[]): { loadKg: number; bodyweightReps: number } {
  let loadKg = 0;
  let bodyweightReps = 0;
  for (const set of sets) {
    if (set.isWarmup || set.reps < 1) continue;
    if (set.weightKg > 0) loadKg += set.weightKg * set.reps;
    else bodyweightReps += set.reps;
  }
  return { loadKg, bodyweightReps };
}

// Variación (fracción) respecto a la semana anterior. Sin semana previa con datos: sin tendencia.
export function trendVsPrevious(current: number, previous: number | null): number | null {
  if (previous === null || previous <= 0) return null;
  return (current - previous) / previous;
}

export type ProgressPoint = {
  workoutId: string;
  date: DateString;
  estimated1RM: number; // mejor 1RM estimado del entrenamiento (0 en peso corporal)
  volumeKg: number;
  bodyweightReps: number;
};

// Un punto por entrenamiento para el gráfico de un ejercicio, ordenado por fecha.
export function exerciseProgressSeries(
  entries: { workoutId: string; date: DateString; sets: VolumeSet[] }[],
): ProgressPoint[] {
  return entries
    .filter((entry) => entry.sets.some((s) => !s.isWarmup && s.reps >= 1))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => {
      const { loadKg, bodyweightReps } = setVolume(entry.sets);
      const best = Math.max(
        0,
        ...entry.sets.filter((s) => !s.isWarmup).map((s) => estimated1RM(s.weightKg, s.reps)),
      );
      return {
        workoutId: entry.workoutId,
        date: entry.date,
        estimated1RM: best,
        volumeKg: loadKg,
        bodyweightReps,
      };
    });
}
