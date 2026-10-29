import { z } from "zod";
import type { DraftStorage } from "@/lib/workout/draft";
import {
  coachEditorDraftKey,
  decodeCoachEditorDraft,
  type CoachEditorEntry,
  type CoachEditorStorage,
} from "./typed-editor-draft";
export type CoachEditorScope = { userId: string; programId: string; sessionId: string };
export type CoachEditorStoredEntry = {
  key: string;
  entry: Exclude<CoachEditorEntry, { kind: "empty" }>;
};
type Locks = { request(name: string, operation: () => void): Promise<unknown> };
const prefix = (scope: CoachEditorScope) =>
  `is:coach-draft:v1:${scope.userId}:${scope.programId}:${scope.sessionId}:`;
function assertKey(scope: CoachEditorScope, key: string) {
  for (const id of [scope.userId, scope.programId, scope.sessionId]) z.uuid().parse(id);
  if (!key.startsWith(prefix(scope))) throw Error("El borrador pertenece a otro contexto.");
  z.uuid().parse(key.slice(prefix(scope).length));
}
export function createCoachEditorBrowserStorage(
  scope: CoachEditorScope,
  getStorage: () => DraftStorage = () => window.localStorage,
  getLocks: () => Locks | undefined = () =>
    typeof navigator === "undefined" ? undefined : navigator.locks,
): CoachEditorStorage {
  return {
    async get(key) {
      assertKey(scope, key);
      return getStorage().getItem(key);
    },
    async compareAndSet(key, before, next) {
      assertKey(scope, key);
      const locks = getLocks();
      if (!locks)
        throw Object.assign(Error("El navegador no permite una escritura protegida."), {
          reason: "unsupported",
        });
      await locks.request("iron-strength-coach-editor:" + key, () => {
        const storage = getStorage();
        if (storage.getItem(key) !== before)
          throw Object.assign(Error("El borrador cambió en otra ventana."), { reason: "conflict" });
        if (next === null) storage.removeItem(key);
        else storage.setItem(key, next);
        if (storage.getItem(key) !== next)
          throw Error("No se pudo verificar el guardado en este dispositivo.");
      });
    },
  };
}
export function listCoachEditorEntries(
  scope: CoachEditorScope,
  getStorage: () => DraftStorage = () => window.localStorage,
): { ok: boolean; entries: CoachEditorStoredEntry[] } {
  const entries: CoachEditorStoredEntry[] = [];
  try {
    const storage = getStorage();
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(prefix(scope))) continue;
      const raw = storage.getItem(key);
      if (raw === null) continue;
      let entry = decodeCoachEditorDraft(raw, scope);
      if (entry.kind === "empty") continue;
      if (entry.kind !== "unknown") {
        try {
          if (coachEditorDraftKey(entry.draft) !== key) entry = { kind: "unknown", raw };
        } catch {
          entry = { kind: "unknown", raw };
        }
      }
      entries.push({ key, entry });
    }
    entries.sort((a, b) => {
      const date = (entry: CoachEditorStoredEntry) =>
        entry.entry.kind === "unknown" ? "9999" : entry.entry.draft.updatedAt;
      return date(b).localeCompare(date(a)) || a.key.localeCompare(b.key);
    });
    return { ok: true, entries };
  } catch {
    return { ok: false, entries };
  }
}
