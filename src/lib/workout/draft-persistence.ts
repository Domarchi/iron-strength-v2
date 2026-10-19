import { saveDraft, type DraftStorage, type WorkoutDraft } from "./draft";

export type DraftSaveStatus = "checking" | "saved" | "error";

// Un estado externo al render permite informar el resultado real de cada escritura, también
// la inicial, sin posponer los cambios del entrenamiento a un efecto.
export function createDraftPersistence(getStorage: () => DraftStorage | undefined) {
  let status: DraftSaveStatus = "checking";
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => status,
    subscribe: (notify: () => void) => {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    persist: (draft: WorkoutDraft) => {
      const next = saveDraft(getStorage(), draft) ? "saved" : "error";
      if (next !== status) {
        status = next;
        listeners.forEach((notify) => notify());
      }
      return next === "saved";
    },
  };
}
