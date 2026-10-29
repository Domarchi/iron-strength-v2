"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getCoachProgramTree } from "@/lib/data/coach-programs";
import {
  copyProgramWeeks,
  assignReviewedProgram,
  getAssignmentPreview,
  type PlanningFailure,
} from "@/lib/data/planning";
import { planningDraftSchema, type PlanningDraft } from "@/lib/coach/planning-draft";
const messages: Record<PlanningFailure, string> = {
  conflict:
    "La planificación cambió desde la revisión. Tus elecciones siguen aquí; vuelve a revisar antes de confirmar.",
  invalid: "Revisa las semanas, el alumno y las fechas antes de confirmar.",
  forbidden: "No tienes permiso para modificar esta planificación.",
  not_found:
    "La planificación o su copia confirmada ya no está disponible. Conservamos la petición local.",
  week_locked: "Una semana destino está bloqueada. Elige solo semanas posteriores a la actual.",
  limit: "La planificación excede los límites permitidos.",
  destination_not_empty: "Confirma explícitamente las semanas que quieres reemplazar.",
  has_workouts:
    "El programa existente ya tiene entrenamientos y no se puede reemplazar. Elige otro lunes de inicio.",
};
export async function reviewPlanningCopyAction(programId: string) {
  await requireCoach();
  if (!z.uuid().safeParse(programId).success)
    return { ok: false as const, error: messages.invalid };
  try {
    const tree = await getCoachProgramTree(await createClient(), programId);
    return tree ? { ok: true as const, tree } : { ok: false as const, error: messages.not_found };
  } catch {
    return {
      ok: false as const,
      error: "No se pudo cargar la revisión. Tus elecciones se conservan; vuelve a intentar.",
    };
  }
}
export async function reviewAssignmentAction(
  programId: string,
  studentId: string,
  startDate: string,
) {
  const user = await requireCoach();
  if (
    !z.uuid().safeParse(programId).success ||
    !z.uuid().safeParse(studentId).success ||
    !z.iso.date().safeParse(startDate).success
  )
    return { ok: false as const, error: messages.invalid };
  try {
    const db = await createClient();
    const target = await db
      .from("profiles")
      .select("id,coach_id,full_name")
      .eq("id", studentId)
      .eq("is_active", true)
      .maybeSingle();
    if (!target.data || target.data.coach_id !== user.id)
      return { ok: false as const, error: messages.forbidden };
    const preview = await getAssignmentPreview(db, programId, studentId, startDate);
    return preview
      ? { ok: true as const, preview, studentLabel: target.data.full_name }
      : { ok: false as const, error: messages.not_found };
  } catch {
    return {
      ok: false as const,
      error: "No se pudo cargar la revisión de asignación. Tus elecciones se conservan.",
    };
  }
}
export async function confirmPlanningAction(value: PlanningDraft) {
  const user = await requireCoach();
  const parsed = planningDraftSchema.safeParse(value);
  if (!parsed.success || parsed.data.userId !== user.id)
    return { ok: false as const, error: messages.invalid };
  const draft = parsed.data;
  try {
    const db = await createClient();
    const result =
      draft.operation === "copy"
        ? await copyProgramWeeks(db, draft.programId, { id: draft.id, input: draft.input })
        : await assignReviewedProgram(db, draft.programId, { id: draft.id, input: draft.input });
    if (!result.ok)
      return { ok: false as const, error: messages[result.reason], reason: result.reason };
    revalidatePath(`/coach/programs/${draft.programId}`);
    revalidatePath("/coach/programs");
    revalidatePath("/coach/students");
    revalidatePath("/week");
    return {
      ok: true as const,
      ...("programId" in result ? { programId: result.programId } : { sessions: result.sessions }),
    };
  } catch {
    return {
      ok: false as const,
      error:
        "No recibimos confirmación. La petición sigue guardada; confirma el mismo intento sin repetir la operación.",
      uncertain: true as const,
    };
  }
}
