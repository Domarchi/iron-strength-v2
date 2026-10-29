import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { constancySourceSchema } from "../../domain/constancy-source";
import type { Database } from "../../types/database";

export type ConstancyReadCode = "capacity" | "unauthorized" | "incompatible" | "unavailable";
export class ConstancyReadError extends Error {
  constructor(readonly code: ConstancyReadCode) {
    super(
      code === "capacity"
        ? "La constancia supera el límite de esta versión. No se muestran cálculos parciales."
        : code === "unauthorized"
          ? "No tienes acceso a esta constancia."
          : code === "incompatible"
            ? "La constancia requiere una versión compatible de la app."
            : "No pudimos consultar la constancia. Vuelve a intentarlo.",
    );
    this.name = "ConstancyReadError";
  }
}

/** One authorized, consistent snapshot. A failed read must never become a zero streak. */
export async function readVisibleConstancy(db: SupabaseClient<Database>, studentId: string) {
  const parsedId = z.uuid().safeParse(studentId);
  if (!parsedId.success) throw new ConstancyReadError("incompatible");
  const id = parsedId.data.toLowerCase();
  let response;
  try {
    response = await db.rpc("get_visible_constancy", { p_student_id: id });
  } catch {
    throw new ConstancyReadError("unavailable");
  }
  if (response.error)
    throw new ConstancyReadError(
      response.error.code === "0A000"
        ? "capacity"
        : response.error.code === "42501"
          ? "unauthorized"
          : "unavailable",
    );
  if (response.data === null) return null;
  const parsed = constancySourceSchema.safeParse(response.data);
  if (!parsed.success || parsed.data.studentId !== id) throw new ConstancyReadError("incompatible");
  return parsed.data;
}
