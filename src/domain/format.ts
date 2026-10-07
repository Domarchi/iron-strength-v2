// Formato de números y prescripciones en español de Chile (coma decimal, punto de miles).
const nf = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

export function formatKg(kg: number): string {
  return `${nf.format(kg)} kg`;
}

export function formatReps(min: number, max: number): string {
  return min === max ? String(min) : `${min}–${max}`;
}

export function formatPrescription(p: {
  sets: number;
  repsMin: number;
  repsMax: number;
  targetWeightKg: number | null;
}): string {
  const base = `${p.sets} × ${formatReps(p.repsMin, p.repsMax)}`;
  return p.targetWeightKg === null ? base : `${base} · ${formatKg(p.targetWeightKg)}`;
}
