import { z } from "zod";
import { alternativeDraftSchema, alternativeRequestSchema } from "./routine-alternatives";
import { layoutRowSchema } from "./routine-layout";
import type { DraftStorage } from "@/lib/workout/draft";
const text = z.string();
const row = z.object({
  id: text,
  exerciseId: text,
  sets: text,
  repsMin: text,
  repsMax: text,
  targetWeightKg: text,
  note: text,
});
const request = z.object({ id: text, revision: z.number().int().nonnegative() });
const schema = z.object({
  version: z.literal(1),
  id: text,
  userId: text,
  programId: text,
  sessionId: text,
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
  title: z.string().optional(),
  edits: z.record(z.string(), row),
  order: z.array(text).nullable(),
  orderRequest: request.nullable(),
  saveRequest: request.extend({ rows: z.array(row), title: z.string().optional() }).nullable(),
  layoutRequest: request
    .extend({ layout: z.array(layoutRowSchema) })
    .nullable()
    .optional(),
  alternativeEdits: z.record(z.string(), z.array(alternativeDraftSchema)).optional(),
  alternativeRequest: alternativeRequestSchema.nullable().optional(),
  copyRequest: z.object({ id: text, exerciseId: text.optional() }).nullable(),
});
export type EditorDraft = z.infer<typeof schema>;
const prefix = (userId: string, programId: string, sessionId: string) =>
  `is:coach-draft:v1:${userId}:${programId}:${sessionId}:`;
const key = (draft: EditorDraft) =>
  `${prefix(draft.userId, draft.programId, draft.sessionId)}${draft.id}`;
export function editorStorage(): DraftStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
export function listEditorDrafts(
  storage: DraftStorage | undefined,
  userId: string,
  programId: string,
  sessionId: string,
): EditorDraft[] {
  if (!storage) return [];
  const result: EditorDraft[] = [];
  try {
    for (let index = 0; index < storage.length; index++) {
      const name = storage.key(index);
      if (!name?.startsWith(prefix(userId, programId, sessionId))) continue;
      try {
        const parsed = schema.safeParse(JSON.parse(storage.getItem(name) ?? "null"));
        if (
          parsed.success &&
          key(parsed.data) === name &&
          parsed.data.userId === userId &&
          parsed.data.programId === programId &&
          parsed.data.sessionId === sessionId
        )
          result.push(parsed.data);
      } catch {
        /* Un registro corrupto no impide recuperar los demás. */
      }
    }
  } catch {
    return result;
  }
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, entry]) => [name, canonical(entry)]),
    );
  return value;
}
export function createEditorPersistence(getStorage: () => DraftStorage | undefined) {
  let status: "clean" | "saved" | "error" = "clean";
  const listeners = new Set<() => void>();
  function report(next: typeof status) {
    status = next;
    listeners.forEach((notify) => notify());
  }
  return {
    restored: () => report("saved"),
    getSnapshot: () => status,
    subscribe: (notify: () => void) => {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    persist: (draft: EditorDraft) => {
      try {
        const storage = getStorage();
        if (!storage) throw new Error("storage");
        storage.setItem(key(draft), JSON.stringify(draft));
        report("saved");
        return true;
      } catch {
        report("error");
        return false;
      }
    },
    remove: (draft: EditorDraft, onlyIfUnchanged = false, silent = false) => {
      try {
        const storage = getStorage();
        if (!storage) throw new Error("storage");
        if (
          !onlyIfUnchanged ||
          JSON.stringify(canonical(JSON.parse(storage.getItem(key(draft)) ?? "null"))) ===
            JSON.stringify(canonical(draft))
        )
          storage.removeItem(key(draft));
        if (!silent) report("clean");
        return true;
      } catch {
        report("error");
        return false;
      }
    },
  };
}
