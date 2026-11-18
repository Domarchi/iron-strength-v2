/**
 * Un valor precargado desde la prescripción es una sugerencia hasta que la serie se marca:
 * se muestra atenuado para no confundirlo con un dato digitado.
 */
export function isSuggestedWeight(
  value: string,
  targetWeightKg: number | null | undefined,
  done: boolean,
): boolean {
  if (done || targetWeightKg == null) return false;
  const text = value.trim().replace(",", ".");
  if (text === "") return false;
  const n = Number(text);
  return Number.isFinite(n) && n === targetWeightKg;
}
