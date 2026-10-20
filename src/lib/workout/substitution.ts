import type { WorkoutDraft } from "./draft";
import { prefillWeight } from "../../domain/progression";

// La elección explícita reemplaza solo un ejercicio aún sin series completadas.
export function substituteExercise(
  draft: WorkoutDraft,
  index: number,
  exerciseId: string,
): WorkoutDraft {
  const current = draft.exercises[index];
  if (!current || current.exerciseId === exerciseId || current.sets.some((s) => s.done))
    return draft;
  const choice = [current.original, ...(current.alternatives ?? [])].find(
    (e) => e?.exerciseId === exerciseId,
  );
  if (!choice) return draft;
  const weight = prefillWeight(choice.prescribed.targetWeightKg, choice.lastWeightKg);
  const next = {
    ...current,
    exerciseId: choice.exerciseId,
    name: choice.name,
    isBodyweight: choice.isBodyweight,
    prescribed: choice.prescribed,
    skipped: false,
    sets: Array.from({ length: choice.prescribed.sets }, (_, i) => ({
      id: `${current.sessionExerciseId}-${i + 1}`,
      weight: weight === null ? "" : String(weight).replace(".", ","),
      reps: "",
      done: false,
      isWarmup: false,
    })),
  };
  return { ...draft, exercises: draft.exercises.map((e, i) => (i === index ? next : e)) };
}
