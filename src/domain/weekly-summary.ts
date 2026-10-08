// Resumen semanal (RF-32; DC-16, DC-29): por semana lunes–domingo, cuántos entrenamientos, días
// entrenados, récords y volumen. Lo calcula quien abre la pantalla; nada se guarda. La semana de un
// entrenamiento es la de su fecha local en Santiago (`performedOn`), no la fecha UTC.
import { addDays, type DateString } from "./dates.ts";
import { detectRecords, type SetRecord } from "./records.ts";
import { setVolume } from "./volume.ts";

export type SummaryWorkout = {
  id: string;
  startedAt: string;
  performedOn: DateString;
  sets: SetRecord[];
};

export type WeekAggregate = {
  weekStart: DateString;
  weekEnd: DateString;
  workoutCount: number;
  trainedDays: number;
  records: number;
  volumeKg: number;
  bodyweightReps: number;
};

// Récords que logró cada entrenamiento frente a todo lo anterior (el primer registro no cuenta).
export function countRecordsPerWorkout(workouts: SummaryWorkout[]): Map<string, number> {
  const ordered = [...workouts].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const result = new Map<string, number>();
  const history: SetRecord[] = [];
  for (const workout of ordered) {
    result.set(workout.id, detectRecords(history, workout.sets).length);
    history.push(...workout.sets);
  }
  return result;
}

export function summarizeWeek(
  weekStart: DateString,
  workouts: SummaryWorkout[],
  recordsByWorkout: Map<string, number>,
): WeekAggregate {
  const weekEnd = addDays(weekStart, 6);
  const inWeek = workouts.filter(
    (w) => w.sets.length > 0 && w.performedOn >= weekStart && w.performedOn <= weekEnd,
  );
  const { loadKg, bodyweightReps } = setVolume(inWeek.flatMap((w) => w.sets));

  return {
    weekStart,
    weekEnd,
    workoutCount: inWeek.length,
    trainedDays: new Set(inWeek.map((w) => w.performedOn)).size,
    records: inWeek.reduce((sum, w) => sum + (recordsByWorkout.get(w.id) ?? 0), 0),
    volumeKg: loadKg,
    bodyweightReps,
  };
}
