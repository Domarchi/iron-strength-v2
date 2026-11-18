/** Lectura de las medidas escritas a mano: coma o punto decimal, vacío = sin dato, sin coerciones raras. */
export type MeasurementFields = {
  weightKg: string;
  waistCm: string;
  chestCm: string;
  armCm: string;
};
export type ParsedMeasurement =
  | {
      ok: true;
      value: {
        weightKg: number | null;
        waistCm: number | null;
        chestCm: number | null;
        armCm: number | null;
      };
    }
  | { ok: false; message: string };

const LIMITS: Record<
  keyof MeasurementFields,
  { label: string; min: number; max: number; decimals: number }
> = {
  weightKg: { label: "Peso", min: 20, max: 300, decimals: 2 },
  waistCm: { label: "Cintura", min: 10, max: 250, decimals: 1 },
  chestCm: { label: "Pecho", min: 10, max: 250, decimals: 1 },
  armCm: { label: "Brazo", min: 10, max: 250, decimals: 1 },
};

export function parseMeasurement(fields: MeasurementFields): ParsedMeasurement {
  const out: Record<string, number | null> = {};
  for (const key of Object.keys(LIMITS) as (keyof MeasurementFields)[]) {
    const { label, min, max, decimals } = LIMITS[key];
    const raw = fields[key].trim().replace(",", ".");
    if (raw === "") {
      out[key] = null;
      continue;
    }
    if (!/^\d+(\.\d+)?$/.test(raw))
      return { ok: false, message: `${label}: escribe solo números.` };
    const n = Number(raw);
    if (n < min || n > max)
      return { ok: false, message: `${label}: debe estar entre ${min} y ${max}.` };
    if ((raw.split(".")[1]?.length ?? 0) > decimals)
      return {
        ok: false,
        message: `${label}: máximo ${decimals} ${decimals === 1 ? "decimal" : "decimales"}.`,
      };
    out[key] = n;
  }
  if (Object.values(out).every((v) => v === null))
    return { ok: false, message: "Ingresa al menos una medida." };
  return { ok: true, value: out as never };
}
