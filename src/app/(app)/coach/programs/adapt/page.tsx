import { z } from "zod";
import { PageHeading } from "@/components/layout/page-heading";
import { requireCoach } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listProgramBases } from "@/lib/data/programs";
import { AdaptBase } from "./adapt-base";
export const metadata = { title: "Adaptar una base · Iron Strength" };
export default async function AdaptBasePage({
  searchParams,
}: {
  searchParams: Promise<{ alumno?: string; base?: string }>;
}) {
  const user = await requireCoach(),
    query = await searchParams,
    db = await createClient();
  const candidate = z.uuid().safeParse(query.alumno);
  const [bases, target] = await Promise.all([
    listProgramBases(db),
    candidate.success
      ? db
          .from("profiles")
          .select("id,full_name,coach_id")
          .eq("id", candidate.data)
          .eq("is_active", true)
          .maybeSingle()
      : Promise.resolve(null),
  ]);
  const student = target?.data?.coach_id === user.id ? target.data : null;
  return (
    <div className="flow-page flex flex-col gap-6">
      <PageHeading
        title="Adaptar una base"
        eyebrow="Planifica más rápido"
        description={
          student
            ? `Prepara una copia para ${student.full_name}.`
            : "Elige una plantilla o un programa anterior para preparar una copia independiente."
        }
      />
      <AdaptBase
        userId={user.id}
        bases={bases}
        studentId={student?.id}
        selectedBaseId={bases.some((b) => b.id === query.base) ? query.base : undefined}
      />
    </div>
  );
}
