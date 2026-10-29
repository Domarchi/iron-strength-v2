export const WORKOUT_SOURCE_KINDS = ["assigned", "personal", "free"] as const;
export type WorkoutSourceKind = (typeof WORKOUT_SOURCE_KINDS)[number];
export function workoutOriginLabel(sourceKind?: WorkoutSourceKind | null): string {
  return {
    assigned: "Programa del coach",
    personal: "Rutina personal",
    free: "Entrenamiento libre",
  }[sourceKind ?? "assigned"];
}
export function workoutTitle(workout: {
  sourceKind?: WorkoutSourceKind | null;
  title?: string | null;
  sessionLabel?: string | null;
}): string {
  if (workout.sourceKind === "personal" || workout.sourceKind === "free")
    return workout.title?.trim() || workoutOriginLabel(workout.sourceKind);
  return workout.sessionLabel ? `Sesión ${workout.sessionLabel}` : "Entrenamiento";
}
