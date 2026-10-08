import { z } from "zod";
import { buildHistoryCsv, csvFileName } from "@/domain/csv";
import { santiagoDate } from "@/domain/dates";
import { getCurrentUser } from "@/lib/auth/session";
import { getHistoryExport } from "@/lib/data/export";
import { createClient } from "@/lib/supabase/server";

// Descarga del historial en CSV (RF-47). Sin parámetro es el del propio usuario; con
// `?alumno=<id>` el coach descarga el de uno de sus alumnos. La RLS decide: si no puede verlo,
// responde igual que si no existiera.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const param = new URL(request.url).searchParams.get("alumno");
  let studentId = user.id;
  if (param !== null) {
    const parsed = z.uuid().safeParse(param);
    if (!parsed.success) return new Response("No encontrado", { status: 404 });
    studentId = parsed.data;
  }

  const result = await getHistoryExport(await createClient(), studentId);
  if (!result.ok) return new Response("No encontrado", { status: 404 });

  const filename = csvFileName(result.studentName, santiagoDate(new Date()));
  return new Response(buildHistoryCsv(result.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
