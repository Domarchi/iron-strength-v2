// Logros del alumno (RF-31, RF-65, RF-66; DC-17, DC-28). Se evalúan al guardar un entrenamiento con
// las reglas puras de `src/domain/achievements.ts` y se guardan para siempre. La RLS decide quién los
// ve (el alumno y su coach) y que solo el alumno inserte los suyos.
import type { SupabaseClient } from "@supabase/supabase-js";
import { santiagoDate, type DateString } from "../../domain/dates.ts";
import {
  isAchievementKind,
  newlyEarned,
  type AchievementKind,
  type AchievementStats,
} from "../../domain/achievements.ts";
import type { Database } from "../../types/database.ts";
import { getTrainingWorkoutRecordCount } from "./training-review";
import { getStreakSummary } from "./streak";

type Client = SupabaseClient<Database>;

export type EarnedAchievement = { kind: AchievementKind; earnedAt: string };

export async function listAchievements(
  db: Client,
  studentId: string,
): Promise<EarnedAchievement[]> {
  const { data, error } = await db
    .from("achievements")
    .select("kind, earned_at")
    .eq("student_id", studentId)
    .order("earned_at", { ascending: true });
  if (error) throw new Error(`No se pudieron cargar los logros: ${error.message}`);

  return data.flatMap((a) =>
    isAchievementKind(a.kind) ? [{ kind: a.kind, earnedAt: a.earned_at }] : [],
  );
}

// Entrenamientos con al menos una serie guardada (los vacíos no cuentan).
export async function countWorkouts(db: Client, studentId: string): Promise<number> {
  const { count, error } = await db
    .from("workouts")
    .select("id, workout_sets!inner(id)", { count: "exact", head: true })
    .eq("student_id", studentId);
  if (error) throw new Error(`No se pudieron contar los entrenamientos: ${error.message}`);
  return count ?? 0;
}

// Estadísticas para evaluar. Solo calcula lo caro (racha, récords) si el logro aún no se tiene.
export async function getAchievementStats(args: {
  db: Client;
  studentId: string;
  workoutId?: string;
  today?: DateString;
  alreadyEarned: Set<AchievementKind>;
}): Promise<AchievementStats> {
  const { db, studentId, alreadyEarned } = args;
  const today = args.today ?? santiagoDate(new Date());

  const [workoutCount, longestStreak, recordCount] = await Promise.all([
    countWorkouts(db, studentId),
    alreadyEarned.has("streak_4")
      ? Promise.resolve(0)
      : getStreakSummary(db, studentId, today).then((s) => s.longest),
    alreadyEarned.has("first_record") || !args.workoutId
      ? Promise.resolve(0)
      : getTrainingWorkoutRecordCount(db, studentId, args.workoutId),
  ]);
  return { workoutCount, longestStreak, recordCount };
}

// Otorga los logros que correspondan y devuelve solo los recién obtenidos (RF-65). Idempotente:
// llamarla dos veces seguidas no repite ni duplica nada.
export async function syncAchievements(args: {
  db: Client;
  studentId: string;
  workoutId?: string;
  today?: DateString;
}): Promise<AchievementKind[]> {
  const earned = await listAchievements(args.db, args.studentId);
  const alreadyEarned = new Set(earned.map((a) => a.kind));

  const stats = await getAchievementStats({ ...args, alreadyEarned });
  const due = newlyEarned(stats, alreadyEarned);
  if (due.length === 0) return [];

  // `ignoreDuplicates` + `select`: si otra llamada se adelantó, solo se informa lo realmente insertado.
  const { data, error } = await args.db
    .from("achievements")
    .upsert(
      due.map((kind) => ({ student_id: args.studentId, kind })),
      { onConflict: "student_id,kind", ignoreDuplicates: true },
    )
    .select("kind");
  if (error) throw new Error(`No se pudieron guardar los logros: ${error.message}`);

  const inserted = new Set(data.map((row) => row.kind));
  return due.filter((kind) => inserted.has(kind));
}

// Lo necesario para pintar la lista de logros (RF-66): los obtenidos y el avance hacia los demás.
export async function getAchievementsOverview(
  db: Client,
  studentId: string,
  longestStreak: number,
): Promise<{ earned: EarnedAchievement[]; stats: AchievementStats }> {
  const [earned, workoutCount] = await Promise.all([
    listAchievements(db, studentId),
    countWorkouts(db, studentId),
  ]);
  return { earned, stats: { workoutCount, longestStreak, recordCount: 0 } };
}
