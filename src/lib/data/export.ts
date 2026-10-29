// Complete history under the caller's RLS. An invisible student is indistinguishable from missing.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExportSet } from "../../domain/csv";
import { historyCsvRows } from "../../domain/training-history";
import type { Database } from "../../types/database";
import { readVisibleTrainingHistory } from "./training-history";
export type HistoryExport =
  { ok: true; studentName: string; rows: ExportSet[] } | { ok: false; reason: "not_found" };
export async function getHistoryExport(
  db: SupabaseClient<Database>,
  studentId: string,
): Promise<HistoryExport> {
  const history = await readVisibleTrainingHistory(db, studentId);
  if (!history) return { ok: false, reason: "not_found" };
  return { ok: true, studentName: history.student.name, rows: historyCsvRows(history) };
}
