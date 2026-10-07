import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConstancyStrip } from "@/components/streak/constancy-strip";
import { santiagoDate } from "@/domain/dates";
import { formatDuration, formatKg } from "@/domain/format";
import { programState } from "@/domain/program-weeks";
import { listAssignedPrograms } from "@/lib/data/programs";
import { listExerciseProgress } from "@/lib/data/progress";
import { getStreakSummary } from "@/lib/data/streak";
import { listWorkouts } from "@/lib/data/workouts";
import { createClient } from "@/lib/supabase/server";
import { setStudentActiveAction } from "../actions";
import { ResetLinkButton } from "../reset-link-button";

export const metadata = { title: "Alumno · Iron Strength" };

const day = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fmt = (date: string) => day.format(new Date(`${date}T00:00:00Z`));
const round1 = (n: number) => Math.round(n * 10) / 10;

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const today = santiagoDate(new Date());

  const { data: student } = await db
    .from("profiles")
    .select("id, full_name, is_active, role")
    .eq("id", id)
    .eq("role", "student")
    .maybeSingle();
  if (!student) notFound();

  const [streak, workouts, records, programs] = await Promise.all([
    getStreakSummary(db, id, today),
    listWorkouts(db, id, { limit: 10 }),
    listExerciseProgress(db, id),
    listAssignedPrograms(db, id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/coach/students" className="text-sm text-primary">
          ← Alumnos
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          {student.full_name}
          {!student.is_active ? (
            <span className="rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
              Desactivado
            </span>
          ) : null}
        </h1>
      </header>

      <ConstancyStrip {...streak} />

      <section aria-labelledby="programs-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="programs-heading" className="text-lg font-medium">
            Programas
          </h2>
          <Button variant="outline" render={<Link href="/coach/programs" />}>
            Asignar un programa
          </Button>
        </div>
        {programs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este alumno no tiene programas asignados.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {programs.map((p) => {
              const state =
                p.startDate && p.endsOn
                  ? programState(
                      { startDate: p.startDate, endsOn: p.endsOn, weeksCount: p.weeksCount },
                      today,
                    )
                  : null;
              return (
                <li key={p.id}>
                  <Link
                    href={`/coach/programs/${p.id}`}
                    className="flex min-h-14 items-center justify-between gap-3 p-3 hover:bg-muted/50"
                  >
                    <span className="min-w-0 truncate font-medium">{p.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {state === "active"
                        ? "En curso"
                        : state === "scheduled"
                          ? "Programado"
                          : "Terminado"}
                      {p.startDate && p.endsOn ? ` · ${fmt(p.startDate)} al ${fmt(p.endsOn)}` : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-lg font-medium">
          Últimos entrenamientos
        </h2>
        {workouts.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no registra entrenamientos.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {workouts.items.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/history/${w.id}`}
                  className="flex min-h-14 flex-col justify-center gap-0.5 p-3 hover:bg-muted/50"
                >
                  <span className="font-medium">{fmt(w.performedOn)}</span>
                  <span className="text-sm text-muted-foreground">
                    {w.sessionLabel ? `Sesión ${w.sessionLabel} · ` : ""}
                    {w.workingSets} series · {formatDuration(w.durationSeconds)}
                    {w.volumeKg > 0 ? ` · ${formatKg(w.volumeKg)}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="records-heading" className="flex flex-col gap-3">
        <h2 id="records-heading" className="text-lg font-medium">
          Mejores marcas
        </h2>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay marcas registradas.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {records.map((r) => (
              <li key={r.exerciseId}>
                <Link
                  href={`/progress/${r.exerciseId}?alumno=${id}`}
                  className="flex min-h-14 flex-col justify-center gap-0.5 p-3 hover:bg-muted/50"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {r.isBodyweight
                      ? `Mejor serie: ${r.bestReps} repeticiones`
                      : `Mejor peso ${formatKg(r.bestWeightKg)} · 1RM estimado ${formatKg(round1(r.bestEstimated1RM))}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acceso del alumno</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Suspense fallback={null}>
            <ResetLinkButton studentId={student.id} studentName={student.full_name} />
          </Suspense>
          <form action={setStudentActiveAction} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={student.id} />
            <input type="hidden" name="active" value={String(!student.is_active)} />
            <Button type="submit" variant={student.is_active ? "outline" : "secondary"}>
              {student.is_active ? "Desactivar alumno" : "Reactivar alumno"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Desactivar bloquea su acceso al instante y conserva todos sus datos. Es reversible.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
