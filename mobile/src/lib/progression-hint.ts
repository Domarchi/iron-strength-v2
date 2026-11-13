import { suggestProgression, type LastSet } from "../../../src/domain/progression";
import { formatWeight } from "../../../src/domain/training-tools";

/**
 * Referencia de doble progresión para el ejercicio (nunca modifica el programa ni las series).
 * Si el último entrenamiento llegó al tope del rango en todas las series sugiere subir el peso;
 * si no, mantener y apuntar al tope. Sin rango, sin historial o con peso corporal no hay sugerencia.
 */
export function progressionHint(
  last: { sets: LastSet[] } | null,
  prescribed: { sets: number; repsMin: number; repsMax: number; series?: unknown } | null,
  options: { incrementKg: number; isBodyweight: boolean; weightUnit: "kg" | "lb" },
): string | null {
  if (!last || !prescribed || prescribed.series) return null;
  const s = suggestProgression({
    prescription: prescribed,
    lastSets: last.sets,
    incrementKg: options.incrementKg,
    isBodyweight: options.isBodyweight,
  });
  if (!s) return null;
  const weight = formatWeight(s.weightKg, options.weightUnit);
  return s.kind === "increase"
    ? `Sugerencia: sube a ${weight} y apunta a ${s.reps} reps`
    : `Sugerencia: mantén ${weight} y apunta a ${s.reps} reps`;
}
