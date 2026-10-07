// Récords personales (RF-28, DC-6, DC-7). Dos tipos por ejercicio: mayor peso levantado
// (con al menos 1 repetición) y mejor 1RM estimado (Epley). El primer registro de un ejercicio no
// se celebra, las series de calentamiento no cuentan y el peso corporal (0 kg) no tiene récords.

export type SetRecord = {
  exerciseId: string;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
};

export type RecordEvent = {
  exerciseId: string;
  type: "weight" | "estimated1rm";
  value: number;
  previous: number;
};

export type Marks = { weightKg: number; estimated1RM: number };

const EPSILON = 1e-9;

// Fórmula de Epley: peso × (1 + reps / 30). Con 1 repetición es el propio peso.
export function estimated1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps < 1) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

const counts = (s: SetRecord) => !s.isWarmup && s.weightKg > 0 && s.reps >= 1;

// Mejores marcas por ejercicio entre las series computables.
export function bestMarks(sets: SetRecord[]): Map<string, Marks> {
  const marks = new Map<string, Marks>();
  for (const s of sets.filter(counts)) {
    const current = marks.get(s.exerciseId) ?? { weightKg: 0, estimated1RM: 0 };
    marks.set(s.exerciseId, {
      weightKg: Math.max(current.weightKg, s.weightKg),
      estimated1RM: Math.max(current.estimated1RM, estimated1RM(s.weightKg, s.reps)),
    });
  }
  return marks;
}

// Récords que logra una sesión (`current`) frente al historial anterior (`history`).
export function detectRecords(history: SetRecord[], current: SetRecord[]): RecordEvent[] {
  const before = bestMarks(history);
  const now = bestMarks(current);
  const events: RecordEvent[] = [];

  for (const [exerciseId, mark] of now) {
    const previous = before.get(exerciseId);
    if (!previous) continue; // primer registro: no se celebra

    if (mark.weightKg > previous.weightKg + EPSILON) {
      events.push({
        exerciseId,
        type: "weight",
        value: mark.weightKg,
        previous: previous.weightKg,
      });
    }
    if (mark.estimated1RM > previous.estimated1RM + EPSILON) {
      events.push({
        exerciseId,
        type: "estimated1rm",
        value: mark.estimated1RM,
        previous: previous.estimated1RM,
      });
    }
  }
  return events;
}
