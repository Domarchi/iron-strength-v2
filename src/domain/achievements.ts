// Logros (RF-31, RF-65, RF-66; DC-17, DC-28). Catálogo fijo y evaluación pura: dado lo que el alumno
// lleva hecho, qué logros corresponde otorgar que aún no tiene. Los logros son permanentes: esta
// función solo agrega, nunca quita.

export const ACHIEVEMENT_KINDS = [
  "first_workout",
  "first_record",
  "workouts_10",
  "streak_4",
  "workouts_25",
  "workouts_50",
] as const;

export type AchievementKind = (typeof ACHIEVEMENT_KINDS)[number];

export type AchievementStats = {
  workoutCount: number; // entrenamientos con al menos una serie guardada
  longestStreak: number; // semanas seguidas completas, la mejor racha alcanzada
  recordCount: number; // récords personales logrados (basta con uno)
};

type Info = { title: string; condition: string };

const INFO: Record<AchievementKind, Info> = {
  first_workout: { title: "Primer entrenamiento", condition: "Guarda tu primer entrenamiento." },
  first_record: { title: "Primer récord", condition: "Supera tu mejor marca en un ejercicio." },
  workouts_10: { title: "10 entrenamientos", condition: "Guarda 10 entrenamientos." },
  streak_4: {
    title: "4 semanas seguidas",
    condition: "Completa todas las sesiones de 4 semanas seguidas.",
  },
  workouts_25: { title: "25 entrenamientos", condition: "Guarda 25 entrenamientos." },
  workouts_50: { title: "50 entrenamientos", condition: "Guarda 50 entrenamientos." },
};

export const achievementInfo = (kind: AchievementKind): Info => INFO[kind];

export const isAchievementKind = (value: unknown): value is AchievementKind =>
  typeof value === "string" && (ACHIEVEMENT_KINDS as readonly string[]).includes(value);

const REACHED: Record<AchievementKind, (s: AchievementStats) => boolean> = {
  first_workout: (s) => s.workoutCount >= 1,
  first_record: (s) => s.recordCount >= 1,
  workouts_10: (s) => s.workoutCount >= 10,
  streak_4: (s) => s.longestStreak >= 4,
  workouts_25: (s) => s.workoutCount >= 25,
  workouts_50: (s) => s.workoutCount >= 50,
};

export function newlyEarned(
  stats: AchievementStats,
  alreadyEarned: Iterable<AchievementKind>,
): AchievementKind[] {
  const have = new Set<string>(alreadyEarned);
  return ACHIEVEMENT_KINDS.filter((kind) => !have.has(kind) && REACHED[kind](stats));
}

const TARGETS: Partial<Record<AchievementKind, { of: keyof AchievementStats; target: number }>> = {
  workouts_10: { of: "workoutCount", target: 10 },
  workouts_25: { of: "workoutCount", target: 25 },
  workouts_50: { of: "workoutCount", target: 50 },
  streak_4: { of: "longestStreak", target: 4 },
};

// Avance hacia un hito medible ("7 de 10"), tope en la meta. Los logros de una vez no tienen barra.
export function progressToward(
  kind: AchievementKind,
  stats: AchievementStats,
): { current: number; target: number } | null {
  const spec = TARGETS[kind];
  if (!spec) return null;
  return { current: Math.min(stats[spec.of], spec.target), target: spec.target };
}
