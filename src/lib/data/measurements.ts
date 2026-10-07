// Medidas corporales (RF-38, RF-39, DC-15): un registro por fecha, todos los campos opcionales
// pero al menos uno. El alumno gestiona las suyas; el coach solo las ve (RLS).
import type { SupabaseClient } from "@supabase/supabase-js";
import { measurementSchema } from "../../domain/schemas.ts";
import type { DateString } from "../../domain/dates.ts";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;

export type Measurement = {
  id: string;
  measuredOn: DateString;
  weightKg: number | null;
  waistCm: number | null;
  chestCm: number | null;
  armCm: number | null;
};

const toNumber = (v: number | string | null) => (v === null ? null : Number(v));

export async function listMeasurements(db: Client, studentId: string): Promise<Measurement[]> {
  const { data, error } = await db
    .from("body_measurements")
    .select("id, measured_on, weight_kg, waist_cm, chest_cm, arm_cm")
    .eq("student_id", studentId)
    .order("measured_on", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las medidas: ${error.message}`);

  return data.map((m) => ({
    id: m.id,
    measuredOn: m.measured_on,
    weightKg: toNumber(m.weight_kg),
    waistCm: toNumber(m.waist_cm),
    chestCm: toNumber(m.chest_cm),
    armCm: toNumber(m.arm_cm),
  }));
}

export type SaveMeasurementResult =
  { ok: true; replaced: boolean } | { ok: false; reason: "invalid" | "exists" | "forbidden" };

// Guarda las medidas de un día. Si ya hay un registro ese día, exige `replace` (confirmación del
// usuario) y lo reemplaza completo, sin mezclar campos del registro anterior.
export async function saveMeasurement(args: {
  db: Client;
  studentId: string;
  input: unknown;
  replace?: boolean;
}): Promise<SaveMeasurementResult> {
  const parsed = measurementSchema.safeParse(args.input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const m = parsed.data;

  const { data: existing, error: readError } = await args.db
    .from("body_measurements")
    .select("id")
    .eq("student_id", args.studentId)
    .eq("measured_on", m.measuredOn)
    .maybeSingle();
  if (readError) throw new Error(`No se pudo comprobar el registro: ${readError.message}`);

  const columns = {
    weight_kg: m.weightKg,
    waist_cm: m.waistCm,
    chest_cm: m.chestCm,
    arm_cm: m.armCm,
  };

  if (existing) {
    if (!args.replace) return { ok: false, reason: "exists" };
    const { data, error } = await args.db
      .from("body_measurements")
      .update(columns)
      .eq("id", existing.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`No se pudo reemplazar el registro: ${error.message}`);
    return data ? { ok: true, replaced: true } : { ok: false, reason: "forbidden" };
  }

  const { error } = await args.db
    .from("body_measurements")
    .insert({ student_id: args.studentId, measured_on: m.measuredOn, ...columns });
  if (error) {
    if (error.code === "42501") return { ok: false, reason: "forbidden" };
    if (error.code === "23505") return { ok: false, reason: "exists" };
    if (error.code === "23514") return { ok: false, reason: "invalid" };
    throw new Error(`No se pudo guardar la medida: ${error.message}`);
  }
  return { ok: true, replaced: false };
}

export async function deleteMeasurement(args: {
  db: Client;
  id: string;
}): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  const { data, error } = await args.db
    .from("body_measurements")
    .delete()
    .eq("id", args.id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`No se pudo borrar la medida: ${error.message}`);
  return data ? { ok: true } : { ok: false, reason: "not_found" };
}
