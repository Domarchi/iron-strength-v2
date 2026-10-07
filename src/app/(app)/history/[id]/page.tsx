import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { santiagoDate } from "@/domain/dates";
import { isWorkoutEditable } from "@/domain/edit-window";
import { capitalizeFirst, formatDuration, formatKg } from "@/domain/format";
import { getWorkoutRecords } from "@/lib/data/progress";
import { getWorkoutDetail } from "@/lib/data/workouts";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Entrenamiento · Iron Strength" };

const dayFormat = new Intl.DateTimeFormat("es-CL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export default async function WorkoutDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nuevo?: string }>;
}) {
  const [{ id }, { nuevo }, user] = await Promise.all([params, searchParams, requireUser()]);
  const db = await createClient();
  const workout = await getWorkoutDetail(db, id);
  if (!workout) notFound();
  const records = await getWorkoutRecords(db, id);

  const own = workout.studentId === user.id;
  const { summary } = workout;

  return (
    <div className="flex flex-col gap-4">
      {nuevo && own ? (
        <Card role="status" className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-center gap-3 pt-6">
            <CheckCircle2 className="size-8 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="font-semibold">¡Entrenamiento guardado!</p>
              <p className="text-sm text-muted-foreground">
                Buen trabajo. Tu coach ya puede ver cómo te fue.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <header>
        <h1 className="text-xl font-semibold">
          {capitalizeFirst(dayFormat.format(new Date(`${workout.performedOn}T00:00:00Z`)))}
        </h1>
        <p className="text-sm text-muted-foreground">
          {workout.programName ? `${workout.programName} · ` : ""}
          {workout.sessionLabel ? `Sesión ${workout.sessionLabel}` : "Sesión"}
        </p>
      </header>

      {records.length > 0 ? (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="size-5 text-primary" aria-hidden /> Nuevos récords
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {records.map((r) => (
                <li key={`${r.exerciseId}-${r.type}`}>
                  <strong>{r.name}</strong>:{" "}
                  {r.type === "weight"
                    ? `nuevo peso máximo, ${formatKg(r.value)} (antes ${formatKg(r.previous)})`
                    : `nuevo 1RM estimado, ${formatKg(Math.round(r.value * 10) / 10)} (antes ${formatKg(Math.round(r.previous * 10) / 10)})`}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Duración", formatDuration(workout.durationSeconds)],
          ["Series", String(summary.workingSets)],
          ["Volumen", summary.volumeKg > 0 ? formatKg(summary.volumeKg) : "—"],
          ["Ejercicios", String(summary.exerciseCount)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {workout.exercises.map((exercise) => (
        <Card key={exercise.position}>
          <CardHeader>
            <CardTitle className="text-base">{exercise.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col divide-y">
              {exercise.sets.map((set) => (
                <li key={set.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-muted-foreground">
                    {set.isWarmup ? "Calentamiento" : `Serie ${set.setNumber}`}
                  </span>
                  <span className="tabular-nums">
                    {formatKg(set.weightKg)} × {set.reps}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" render={<Link href={own ? "/history" : "/coach/students"} />}>
          Volver
        </Button>
        {own && isWorkoutEditable(workout.performedOn, santiagoDate(new Date())) ? (
          <Button variant="secondary" render={<Link href={`/history/${workout.id}/edit`} />}>
            Editar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
