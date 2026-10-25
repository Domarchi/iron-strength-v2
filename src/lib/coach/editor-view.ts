import { z } from "zod";
export type EditorViewScope = { userId: string; programId: string };
export type EditorView = { week: number; sessions: Record<number, string> };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type Week = { number: number; sessionIds?: string[] };
const schema = z
  .object({
    version: z.literal(1),
    userId: z.string(),
    programId: z.string(),
    week: z.number().int().min(1).max(16),
    sessions: z.record(z.string().regex(/^(?:[1-9]|1[0-6])$/), z.string().min(1)),
  })
  .strict();
export const viewKey = ({ userId, programId }: EditorViewScope) =>
  `is:coach-view:v1:${userId}:${programId}`;
export function readEditorView(
  storage: Storage | undefined,
  scope: EditorViewScope | undefined,
  weeks: Week[],
  initialWeek: number,
): { view: EditorView; writable: boolean } {
  const fallback = {
    week: weeks.some((w) => w.number === initialWeek) ? initialWeek : (weeks[0]?.number ?? 1),
    sessions: {},
  };
  if (!scope) return { view: fallback, writable: true };
  try {
    if (!storage) throw new Error("unavailable");
    const raw = storage.getItem(viewKey(scope));
    if (raw === null) return { view: fallback, writable: true };
    const parsed = schema.safeParse(JSON.parse(raw));
    if (
      !parsed.success ||
      parsed.data.userId !== scope.userId ||
      parsed.data.programId !== scope.programId
    )
      throw new Error("incompatible");
    const saved = parsed.data;
    return {
      view: {
        week: weeks.some((w) => w.number === saved.week) ? saved.week : fallback.week,
        sessions: Object.fromEntries(
          weeks.flatMap((w) => {
            const selected = w.sessionIds?.includes(saved.sessions[w.number])
              ? saved.sessions[w.number]
              : w.sessionIds?.[0];
            return selected ? [[w.number, selected]] : [];
          }),
        ),
      },
      writable: true,
    };
  } catch {
    return { view: fallback, writable: false };
  }
}
export function saveEditorView(
  storage: Storage | undefined,
  scope: EditorViewScope,
  view: EditorView,
): boolean {
  try {
    if (!storage) return false;
    const previous = storage.getItem(viewKey(scope));
    if (previous !== null) {
      const parsed = schema.safeParse(JSON.parse(previous));
      if (
        !parsed.success ||
        parsed.data.userId !== scope.userId ||
        parsed.data.programId !== scope.programId
      )
        return false;
    }
    const value = JSON.stringify(schema.parse({ version: 1, ...scope, ...view }));
    storage.setItem(viewKey(scope), value);
    return storage.getItem(viewKey(scope)) === value;
  } catch {
    return false;
  }
}
export function editorViewStorage(): globalThis.Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function clearEditorViews(storage: globalThis.Storage | undefined, userId: string): void {
  try {
    if (!storage) return;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) {
      const parts = key?.split(":");
      if (parts?.[0] === "is" && parts[1] === "coach-view" && parts[3] === userId)
        storage.removeItem(key!);
    }
  } catch {
    /* Orientation only: denied browser storage must not prevent account exit. */
  }
}
