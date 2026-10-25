import { mobileRoutineSchema } from "../../../src/lib/mobile/contracts";
import { canStartDownloadedSession, type WeekPackage } from "../../../src/lib/offline/package";
import { programWeekNumber } from "../../../src/domain/program-weeks";
export function downloadedRoutine(pack: WeekPackage | null, userId: string, sessionId: string) {
  if (pack?.userId !== userId) return null;
  const context = pack.sessions.find((s) => s.context.session.id === sessionId)?.context;
  if (!context) return null;
  const parsed = mobileRoutineSchema.safeParse({ version: 1, ...context });
  return parsed.success ? parsed.data : null;
}
export function downloadedCanStart(
  pack: WeekPackage | null,
  userId: string,
  sessionId: string,
  today: string,
) {
  return pack?.userId === userId && canStartDownloadedSession(pack, sessionId, today);
}
export function downloadedWeekCurrent(pack: WeekPackage | null, userId: string, today: string) {
  return (
    pack?.userId === userId &&
    programWeekNumber(pack.program, today) === pack.weekNumber &&
    today >= pack.weekStart &&
    today <= pack.weekEnd
  );
}
export function downloadedHistory(pack: WeekPackage | null, userId: string, exerciseId: string) {
  return pack?.userId === userId && Object.prototype.hasOwnProperty.call(pack.history, exerciseId)
    ? pack.history[exerciseId]
    : null;
}
export const downloadedAt = (instant: string) =>
  new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(new Date(instant));
