// Cumplimiento de sesiones (RF-19, RF-25, RF-33; DC-11). Una sesión planificada está "cumplida"
// cuando existe al menos un entrenamiento terminado con al menos 1 serie completada. El primer
// entrenamiento por fecha cumple la sesión; los siguientes de la misma sesión son extras y no
// afectan racha ni cumplimiento.
import { addDays, type DateString } from "./dates";
import { programWeekStart, type ProgramRange } from "./program-weeks";

export type PlannedSession = { id: string; weekNumber: number; label: string };

export type WorkoutSummary = {
  id: string;
  programSessionId: string | null;
  startedAt: string; // ISO
  setCount: number; // series completadas (incluye calentamiento)
};

export type SessionStatus = "done" | "pending" | "missed" | "upcoming";

export type SessionStatusEntry = {
  sessionId: string;
  label: string;
  status: SessionStatus;
  workoutId: string | null;
};

const isFulfilling = (w: WorkoutSummary) => w.setCount >= 1;

// Para cada entrenamiento: ¿cumple una sesión planificada o es un extra?
export function classifyWorkouts(workouts: WorkoutSummary[]): Map<string, "completion" | "extra"> {
  const result = new Map<string, "completion" | "extra">();
  const sorted = [...workouts].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const fulfilled = new Set<string>();

  for (const workout of sorted) {
    if (
      workout.programSessionId &&
      isFulfilling(workout) &&
      !fulfilled.has(workout.programSessionId)
    ) {
      fulfilled.add(workout.programSessionId);
      result.set(workout.id, "completion");
    } else {
      result.set(workout.id, "extra");
    }
  }
  return result;
}

// Estado de cada sesión planificada de una semana del programa, según el día de hoy.
export function sessionStatuses(input: {
  program: ProgramRange;
  sessions: PlannedSession[];
  workouts: WorkoutSummary[];
  weekNumber: number;
  today: DateString;
}): SessionStatusEntry[] {
  const { program, sessions, workouts, weekNumber, today } = input;

  const weekStart = programWeekStart(program, weekNumber);
  const weekEnd = addDays(weekStart, 6);
  const classification = classifyWorkouts(workouts);
  const fulfilling = new Map<string, string>(); // sessionId -> workoutId
  for (const workout of [...workouts].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    if (workout.programSessionId && classification.get(workout.id) === "completion") {
      fulfilling.set(workout.programSessionId, workout.id);
    }
  }

  return sessions
    .filter((s) => s.weekNumber === weekNumber)
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((session) => {
      const workoutId = fulfilling.get(session.id) ?? null;
      let status: SessionStatus;
      if (workoutId) status = "done";
      else if (today < weekStart) status = "upcoming";
      else if (today > weekEnd) status = "missed";
      else status = "pending";
      return { sessionId: session.id, label: session.label, status, workoutId };
    });
}

export type WeekCompliance = {
  planned: number;
  done: number;
  ratio: number | null; // null en una semana de descarga (sin sesiones)
  complete: boolean;
  deload: boolean;
};

export function weekCompliance(statuses: SessionStatusEntry[]): WeekCompliance {
  const planned = statuses.length;
  const done = statuses.filter((s) => s.status === "done").length;
  if (planned === 0) return { planned: 0, done: 0, ratio: null, complete: false, deload: true };
  return {
    planned,
    done,
    ratio: Math.min(1, done / planned),
    complete: done >= planned,
    deload: false,
  };
}
