/** Siguiente valor de peso tras sumar `delta` (coma decimal, nunca negativo, sin ruido de coma flotante). */
export function adjustWeightText(current: string, delta: number, fallback: number | null): string {
  const text = current.trim().replace(",", ".");
  const base = text === "" ? (fallback ?? 0) : Number(text);
  if (!Number.isFinite(base)) return current;
  const next = Math.max(0, Math.round((base + delta) * 100) / 100);
  return String(next).replace(".", ",");
}
