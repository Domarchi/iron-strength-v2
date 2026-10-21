import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  assignmentInputSchema,
  copyWeeksInputSchema,
  existingProgramSchema,
  programSnapshot,
  type AssignmentInput,
  type CopyWeeksInput,
} from "@/lib/coach/planning";
import { getProgramTree, type Failure } from "./programs";
import { addDays } from "@/domain/dates";
type Client = SupabaseClient<Database>;
export type PlanningFailure = Failure | "has_workouts" | "destination_not_empty";
type Result<T> = ({ ok: true } & T) | { ok: false; reason: PlanningFailure };
function failure(
  error: { code?: string; message: string },
  operation: "copy" | "assign",
): { ok: false; reason: PlanningFailure } {
  if (error.code === "40001") return { ok: false, reason: "conflict" };
  if (error.code === "42501") return { ok: false, reason: "forbidden" };
  if (error.code === "55000") return { ok: false, reason: "week_locked" };
  if (error.code === "P0002") return { ok: false, reason: "not_found" };
  if (error.code === "P0001")
    return { ok: false, reason: operation === "copy" ? "destination_not_empty" : "has_workouts" };
  if (
    ["22023", "22P02", "22007", "22008", "23503", "23505", "23514", "23502", "22003"].includes(
      error.code ?? "",
    )
  )
    return { ok: false, reason: "invalid" };
  throw new Error(error.message);
}
export async function copyProgramWeeks(
  db: Client,
  programId: string,
  request: { id: string; input: CopyWeeksInput },
): Promise<Result<{ sessions: number }>> {
  const parsed = copyWeeksInputSchema.safeParse(request.input);
  if (!parsed.success || !z.uuid().safeParse(request.id).success)
    return { ok: false, reason: "invalid" };
  const { data, error } = await db.rpc("copy_program_weeks", {
    p_program_id: programId,
    p_request_id: request.id,
    p_request: parsed.data,
  });
  return error ? failure(error, "copy") : { ok: true, sessions: data };
}
export async function getAssignmentPreview(
  db: Client,
  programId: string,
  studentId: string,
  startDate: string,
) {
  if (!z.uuid().safeParse(studentId).success || !z.iso.date().safeParse(startDate).success)
    return null;
  const tree = await getProgramTree(db, programId);
  if (!tree || tree.studentId !== null) return null;
  const { data, error } = await db.rpc("planning_assignment_snapshot", {
    p_student_id: studentId,
    p_start_date: startDate,
    p_end_date: addDays(startDate, tree.weeksCount * 7 - 1),
  });
  if (error) throw new Error(error.message);
  const existing = z.array(existingProgramSchema).safeParse(data);
  if (!existing.success)
    throw new Error("No se pudo validar la revisión de los programas existentes.");
  return { source: programSnapshot(tree), existing: existing.data };
}
export async function assignReviewedProgram(
  db: Client,
  programId: string,
  request: { id: string; input: AssignmentInput },
): Promise<Result<{ programId: string }>> {
  const parsed = assignmentInputSchema.safeParse(request.input);
  if (!parsed.success || !z.uuid().safeParse(request.id).success)
    return { ok: false, reason: "invalid" };
  const { data, error } = await db.rpc("assign_program_reviewed", {
    p_template_id: programId,
    p_request_id: request.id,
    p_request: parsed.data,
  });
  return error ? failure(error, "assign") : { ok: true, programId: data };
}
