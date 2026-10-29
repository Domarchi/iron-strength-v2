import { workoutDraftSchema, type DraftStorage, type WorkoutDraft } from "../workout/draft";
import { trainingGuardKey } from "../workout/training-guard";
const incompatible = () =>
  Error("Un borrador necesita una versión compatible. Se conserva y no iniciamos otro encima.");
/** Strict recovery inventory. Never migrates/removes unknown records or masks a storage failure. */
export function readLegacyWebDrafts(storage: DraftStorage, userId: string): WorkoutDraft[] {
  const drafts = new Map<string, WorkoutDraft>();
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i),
      parts = key?.split(":");
    if (!key || parts?.[0] !== "is" || parts[1] !== "draft" || parts[3] !== userId) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw incompatible();
    }
    if (!value || typeof value !== "object") throw incompatible();
    const v = value as Record<string, unknown>;
    if (
      key === trainingGuardKey(userId) &&
      Object.keys(v).length === 3 &&
      v.version === 4 &&
      v.userId === userId &&
      v.kind === "typed-training"
    )
      continue;
    const expected = parts[2] === "v1" ? 1 : parts[2] === "v2" ? 2 : parts[2] === "v3" ? 3 : null;
    if (parts.length !== 5 || expected === null || v.version !== expected) throw incompatible();
    const body = expected === 1 ? v : v.draft;
    if (
      !body ||
      typeof body !== "object" ||
      (body as Record<string, unknown>).version !== (expected === 3 ? 2 : 1)
    )
      throw incompatible();
    const parsed = workoutDraftSchema.safeParse(body);
    if (
      !parsed.success ||
      parsed.data.userId !== userId ||
      parsed.data.plannedSessionId !== parts[4]
    )
      throw incompatible();
    const draft = { ...parsed.data, version: 2 as const },
      prior = drafts.get(draft.workoutId);
    if (!prior || prior.updatedAt < draft.updatedAt) drafts.set(draft.workoutId, draft);
  }
  return [...drafts.values()];
}
