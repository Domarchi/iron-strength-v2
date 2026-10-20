import { z } from "zod";
import type { DraftStorage } from "@/lib/workout/draft";
export const programCopySchema = z.object({
  version: z.literal(1),
  copyId: z.uuid(),
  name: z.string().min(1).max(100),
  updatedAt: z.iso.datetime(),
});
export type ProgramCopyDraft = z.infer<typeof programCopySchema>;
const prefix = (userId: string, programId: string) => `is:program-copy:v1:${userId}:${programId}:`;
export function readProgramCopy(
  storage: DraftStorage,
  userId: string,
  programId: string,
  copyId?: string | null,
): ProgramCopyDraft | null {
  const entries: ProgramCopyDraft[] = [];
  const start = prefix(userId, programId);
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(start)) continue;
    try {
      const parsed = programCopySchema.safeParse(JSON.parse(storage.getItem(key) ?? "null"));
      if (parsed.success && key === start + parsed.data.copyId) entries.push(parsed.data);
    } catch {
      /* Una entrada dañada no bloquea otras peticiones. */
    }
  }
  return (
    entries.find((e) => e.copyId === copyId) ??
    entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
    null
  );
}
export function saveProgramCopy(
  storage: DraftStorage,
  userId: string,
  programId: string,
  draft: ProgramCopyDraft,
): void {
  storage.setItem(
    prefix(userId, programId) + draft.copyId,
    JSON.stringify(programCopySchema.parse(draft)),
  );
}
export function clearProgramCopy(
  storage: DraftStorage,
  userId: string,
  programId: string,
  copyId: string,
): void {
  storage.removeItem(prefix(userId, programId) + copyId);
}
