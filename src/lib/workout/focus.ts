import { workoutFocusKey, type WorkoutDraft, type DraftStorage } from "./draft";
import { isExerciseComplete, nextPendingExercise } from "./runner-state";
import { nextSupersetSet } from "@/domain/superset-rounds";

export function resolveWorkoutFocus(
  draft: WorkoutDraft,
  preferred: string | null = null,
): string | null {
  const chosen = draft.exercises.find(
    (e) => e.sessionExerciseId === preferred && !e.skipped && !isExerciseComplete(e),
  );
  if (chosen) return chosen.sessionExerciseId;
  const first = nextPendingExercise(draft);
  const target = first?.supersetId ? nextSupersetSet(draft.exercises, first.supersetId) : null;
  return target
    ? draft.exercises[target.exerciseIndex].sessionExerciseId
    : (first?.sessionExerciseId ?? null);
}
export function focusedExerciseIds(draft: WorkoutDraft, activeId: string | null): string[] {
  const current = draft.exercises.find((e) => e.sessionExerciseId === activeId);
  if (!current) return [];
  return draft.exercises
    .filter(
      (e) =>
        e.sessionExerciseId === activeId ||
        (current.supersetId && e.supersetId === current.supersetId),
    )
    .map((e) => e.sessionExerciseId);
}

export function readWorkoutFocus(
  storage: DraftStorage | undefined,
  draft: WorkoutDraft,
): string | null {
  try {
    const value = JSON.parse(
      storage?.getItem(workoutFocusKey(draft.userId, draft.workoutId)) ?? "null",
    );
    return resolveWorkoutFocus(
      draft,
      value?.version === 1 && typeof value.activeExerciseId === "string"
        ? value.activeExerciseId
        : null,
    );
  } catch {
    return resolveWorkoutFocus(draft);
  }
}
// Preferencia de vista separada del registro: cambiar de ejercicio nunca reescribe series de otra pestaña.
export function rememberWorkoutFocus(
  storage: DraftStorage | undefined,
  draft: WorkoutDraft,
  activeExerciseId: string | null,
): boolean {
  if (!storage) return false;
  try {
    const key = workoutFocusKey(draft.userId, draft.workoutId);
    const raw = storage.getItem(key);
    if (raw !== null && JSON.parse(raw)?.version !== 1) return false;
    const encoded = JSON.stringify({ version: 1, activeExerciseId });
    storage.setItem(key, encoded);
    return storage.getItem(key) === encoded;
  } catch {
    return false;
  }
}
