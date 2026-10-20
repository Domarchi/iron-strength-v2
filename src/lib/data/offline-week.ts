import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { santiagoDate } from "@/domain/dates";
import { getWeekView } from "./week";
import { getWorkoutContext } from "./workout-context";
import { listExerciseHistory } from "./exercise-history";
import { parseWeekPackage, type WeekPackage } from "@/lib/offline/package";

export async function downloadCurrentWeek(
  db: SupabaseClient<Database>,
  userId: string,
  now = new Date(),
): Promise<WeekPackage> {
  const today = santiagoDate(now);
  // No aceptar que un coach descargue datos privados para otra identidad local.
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || auth.user?.id !== userId)
    throw new Error("La sesión no corresponde a esta cuenta.");
  const view = await getWeekView(db, userId, today);
  if (view.kind !== "active") throw new Error("No hay una semana vigente para descargar.");
  const revisions = async () => {
    const { data, error } = await db
      .from("program_sessions")
      .select("id, revision, weekday")
      .eq("program_id", view.program.id)
      .eq("week_number", view.weekNumber)
      .order("id");
    if (error) throw new Error("No se pudo verificar la rutina.");
    return data;
  };
  const before = await revisions();
  if (
    before.length !== view.sessions.length ||
    before.some((r) => !view.sessions.some((s) => s.sessionId === r.id))
  )
    throw new Error("La semana cambió. Vuelve a descargarla.");
  const sessions = await Promise.all(
    view.sessions.map(async (s) => {
      const result = await getWorkoutContext(db, userId, s.sessionId, today);
      if (!result.ok || !result.canStart)
        throw new Error("La semana cambió. Vuelve a descargarla.");
      return {
        revision: before.find((r) => r.id === s.sessionId)!.revision,
        weekday: s.overrideWeekday ?? s.weekday ?? null,
        context: result.context,
      };
    }),
  );
  const ids = [
    ...new Set(
      sessions.flatMap((s) =>
        s.context.exercises.flatMap((e) => [
          e.exerciseId,
          ...(e.alternatives ?? []).map((a) => a.exerciseId),
        ]),
      ),
    ),
  ];
  const history = Object.fromEntries(
    await Promise.all(ids.map(async (id) => [id, await listExerciseHistory(db, userId, id)])),
  );
  const [after, fresh] = await Promise.all([revisions(), getWeekView(db, userId, today)]);
  if (
    JSON.stringify(before) !== JSON.stringify(after) ||
    fresh.kind !== "active" ||
    fresh.program.id !== view.program.id ||
    fresh.program.endsOn !== view.program.endsOn ||
    fresh.weekNumber !== view.weekNumber
  )
    throw new Error("La semana cambió. Vuelve a descargarla.");
  const pack = parseWeekPackage(
    {
      version: 1,
      userId,
      downloadedAt: now.toISOString(),
      program: view.program,
      weekNumber: view.weekNumber,
      weekStart: view.weekStart,
      weekEnd: view.weekEnd,
      sessions,
      history,
    },
    userId,
  );
  if (!pack) throw new Error("La descarga está incompleta. Vuelve a intentarlo.");
  return pack;
}
