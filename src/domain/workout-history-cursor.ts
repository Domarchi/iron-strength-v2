import { z } from "zod";
const instant = z.iso.datetime({ offset: true }).max(64);
const id = z.uuid().transform((value) => value.toLowerCase());
const current = z.object({ version: z.literal(2), userId: id, startedAt: instant, id }).strict();
export type WorkoutHistoryCursor = z.infer<typeof current> | { version: 1; startedAt: string };
/** New cursors bind the account and order; old timestamps require an unambiguous visible row. */
export function parseWorkoutHistoryCursor(value: unknown): WorkoutHistoryCursor | null {
  if (typeof value !== "string" || value.length > 160) return null;
  const parts = value.split("|");
  if (parts.length === 4 && parts[0] === "v2") {
    const result = current.safeParse({
      version: 2,
      userId: parts[1],
      startedAt: parts[2],
      id: parts[3],
    });
    return result.success ? result.data : null;
  }
  const legacy = instant.safeParse(value);
  return legacy.success ? { version: 1, startedAt: legacy.data } : null;
}
export function workoutHistoryCursorString(
  value: Omit<z.infer<typeof current>, "version">,
): string {
  const cursor = current.parse({ version: 2, ...value });
  return `v2|${cursor.userId}|${cursor.startedAt}|${cursor.id}`;
}
