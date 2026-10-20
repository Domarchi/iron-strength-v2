// Doble progresión sugerida (RF-15b, DC-9). Es una referencia visual: nunca modifica el programa.
// Si en el último entrenamiento del ejercicio el alumno hizo todas las series prescritas llegando
// al tope del rango, se sugiere subir el peso y volver al mínimo; si no, mantener y apuntar al tope.

export type LastSet = { weightKg: number; reps: number; isWarmup: boolean };

export type Suggestion = {
  kind: "increase" | "keep";
  weightKg: number;
  reps: number; // repeticiones objetivo sugeridas
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function progressionReason(
  prescription: { sets: number; repsMax: number },
  lastSets: LastSet[],
): "missing_sets" | "below_top" | "at_top" {
  const working = lastSets.filter((set) => !set.isWarmup);
  if (working.length < prescription.sets) return "missing_sets";
  return working.every((set) => set.reps >= prescription.repsMax) ? "at_top" : "below_top";
}

export function suggestProgression(input: {
  prescription: { sets: number; repsMin: number; repsMax: number };
  lastSets: LastSet[]; // series del último entrenamiento de este ejercicio
  incrementKg: number;
  isBodyweight: boolean;
}): Suggestion | null {
  const { prescription, incrementKg, isBodyweight } = input;
  if (isBodyweight) return null;
  // Un rango fijo (p. ej. 5x5) no tiene "tope" que alcanzar: no hay doble progresión.
  if (prescription.repsMin >= prescription.repsMax) return null;

  const working = input.lastSets.filter((s) => !s.isWarmup);
  if (working.length === 0) return null;

  const topWeight = Math.max(...working.map((s) => s.weightKg));
  if (topWeight <= 0) return null;

  if (progressionReason(prescription, working) === "at_top") {
    return {
      kind: "increase",
      weightKg: round2(topWeight + incrementKg),
      reps: prescription.repsMin,
    };
  }
  return { kind: "keep", weightKg: round2(topWeight), reps: prescription.repsMax };
}

// Peso con que arranca cada serie: el prescrito; si no hay, el último usado en ese ejercicio.
export function prefillWeight(
  targetWeightKg: number | null,
  lastUsedWeightKg: number | null,
): number | null {
  return targetWeightKg ?? lastUsedWeightKg ?? null;
}
