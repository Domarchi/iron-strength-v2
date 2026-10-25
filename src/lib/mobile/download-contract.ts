import { z } from "zod";
import { parseWeekPackage, type WeekPackage } from "../offline/package";
const envelope = z
  .object({
    version: z.literal(1),
    userId: z.uuid(),
    pack: z.unknown().refine((value) => value !== undefined),
  })
  .strict();
export type NativeWeekRecord = { version: 1; userId: string; pack: WeekPackage | null };
export function parseNativeWeek(value: unknown, userId: string): NativeWeekRecord | null {
  const parsed = envelope.safeParse(value);
  if (!parsed.success || parsed.data.userId !== userId) return null;
  if (parsed.data.pack === null) return { version: 1, userId, pack: null };
  const pack = parseWeekPackage(parsed.data.pack, userId);
  return pack ? { version: 1, userId, pack } : null;
}
