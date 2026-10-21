import { z } from "zod";
import { assignmentInputSchema, copyWeeksInputSchema } from "./planning";
import type { DraftStorage } from "@/lib/workout/draft";
const base = z.object({
  version: z.literal(1),
  id: z.uuid(),
  userId: z.uuid(),
  programId: z.uuid(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const planningDraftSchema = z.discriminatedUnion("operation", [
  base.extend({ operation: z.literal("copy"), input: copyWeeksInputSchema }).strict(),
  base.extend({ operation: z.literal("assign"), input: assignmentInputSchema }).strict(),
]);
export type PlanningDraft = z.infer<typeof planningDraftSchema>;
const prefix = (userId: string, programId: string, operation: PlanningDraft["operation"]) =>
  `is:planning-request:v1:${userId}:${programId}:${operation}:`;
const key = (draft: PlanningDraft) =>
  prefix(draft.userId, draft.programId, draft.operation) + draft.id;
export function readPlanningDraft(
  storage: DraftStorage,
  userId: string,
  programId: string,
  operation: PlanningDraft["operation"],
  id?: string | null,
): PlanningDraft | null {
  const found: PlanningDraft[] = [];
  for (let i = 0; i < storage.length; i++) {
    const name = storage.key(i);
    if (!name?.startsWith(prefix(userId, programId, operation))) continue;
    try {
      const parsed = planningDraftSchema.safeParse(JSON.parse(storage.getItem(name) ?? "null"));
      if (
        parsed.success &&
        key(parsed.data) === name &&
        parsed.data.userId === userId &&
        parsed.data.programId === programId &&
        parsed.data.operation === operation
      )
        found.push(parsed.data);
    } catch {
      /* Conservar formatos ilegibles o desconocidos. */
    }
  }
  return (
    found.find((d) => d.id === id) ??
    found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
    null
  );
}
export function writePlanningDraft(storage: DraftStorage, draft: PlanningDraft): void {
  const next = planningDraftSchema.parse(draft),
    name = key(next),
    previous = storage.getItem(name);
  if (previous !== null) {
    const old = planningDraftSchema.safeParse(JSON.parse(previous));
    if (
      !old.success ||
      old.data.operation !== next.operation ||
      JSON.stringify(old.data.input) !== JSON.stringify(next.input)
    )
      throw new Error("Conserva la petición original.");
  }
  const raw = JSON.stringify(next);
  storage.setItem(name, raw);
  if (storage.getItem(name) !== raw) throw new Error("No se pudo confirmar la copia local.");
}
export function clearPlanningDraft(storage: DraftStorage, draft: PlanningDraft): void {
  const name = key(draft);
  if (storage.getItem(name) === JSON.stringify(planningDraftSchema.parse(draft)))
    storage.removeItem(name);
}
