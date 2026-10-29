import { z } from "zod";
import { buildHistoryCsv, csvFileName } from "@/domain/csv";
import { santiagoDate } from "@/domain/dates";
import { getCurrentUser } from "@/lib/auth/session";
import { getHistoryExport } from "@/lib/data/export";
import { TrainingHistoryReadError } from "@/lib/data/training-history";
import { createClient } from "@/lib/supabase/server";
const privateHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const failure = (message: string, status: number) =>
  new Response(message, {
    status,
    headers: { ...privateHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
// Own history or a coach-selected student. Database RLS is the authorization boundary.
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return failure("No autorizado", 401);
    const param = new URL(request.url).searchParams.get("alumno");
    let studentId = user.id;
    if (param !== null) {
      const parsed = z.uuid().safeParse(param);
      if (!parsed.success) return failure("No encontrado", 404);
      studentId = parsed.data;
    }
    const result = await getHistoryExport(await createClient(), studentId);
    if (!result.ok) return failure("No encontrado", 404);
    const filename = csvFileName(result.studentName, santiagoDate(new Date()));
    return new Response(buildHistoryCsv(result.rows), {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof TrainingHistoryReadError)
      return failure(
        error.message,
        error.code === "unauthorized" ? 403 : error.code === "unavailable" ? 503 : 409,
      );
    return failure("No pudimos preparar el historial. Vuelve a intentarlo.", 503);
  }
}
