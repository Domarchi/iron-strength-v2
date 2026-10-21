import { isUniformPrescription, type SeriesTarget } from "./prescription-series";
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
  series?: SeriesTarget[] | null;
}): string {
  if (p.series && !isUniformPrescription(p)) return `${p.sets} series · Objetivos por serie`;
  const base = `${p.sets} × ${formatReps(p.repsMin, p.repsMax)}`;
  return p.targetWeightKg === null ? base : `${base} · ${formatKg(p.targetWeightKg)}`;
}

// "52 min", "1 h", "1 h 05 min". Lo que no completa un minuto se redondea hacia arriba (excepto 0).
export function formatDuration(totalSeconds: number): string {
  const minutes = totalSeconds <= 0 ? 0 : Math.ceil(totalSeconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")} min`;
}

// Solo la primera letra en mayúscula ("miércoles, 7 de octubre" → "Miércoles, 7 de octubre").
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase("es-CL") + text.slice(1);
}

// Variación del volumen frente a la semana anterior (RF-32). `trend` es una fracción (0,12 = 12 %).
export function formatTrend(trend: number | null): string {
  if (trend === null) return "Sin semana anterior para comparar";
  if (Math.abs(trend) < 0.005) return "Igual que la semana anterior";
  const percent = Math.max(1, Math.round(Math.abs(trend) * 100));
  return `${percent} % ${trend > 0 ? "más" : "menos"} que la semana anterior`;
}
