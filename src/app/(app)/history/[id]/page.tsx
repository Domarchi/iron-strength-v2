import { workoutTitle, workoutOriginLabel } from "@/domain/workout-title";
import { navigationContext, evidenceReturn } from "@/lib/navigation/training-context";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { santiagoDate } from "@/domain/dates";
import { isWorkoutEditable } from "@/domain/edit-window";
import { capitalizeFirst, formatDuration, formatKg } from "@/domain/format";
import { MarkRead } from "@/components/unread/mark-read";
import { NewAchievements } from "@/components/achievements/new-achievements";
import { CommentsSection } from "@/components/comments/comments-section";
import { isAchievementKind } from "@/domain/achievements";
import { listAchievements } from "@/lib/data/achievements";
import { listComments } from "@/lib/data/comments";
import { getUnreadSummary } from "@/lib/data/unread";
import { getWorkoutRecords } from "@/lib/data/progress";
import { getWorkoutResult } from "@/lib/data/workout-result";
import { TypedWorkoutResult } from "@/components/workout/typed-result";
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
  searchParams: Promise<{
    nuevo?: string;
    logros?: string;
    semanas?: string | string[];
    vista?: string | string[];
    tipo?: string | string[];
    metrica?: string | string[];
    desde?: string;
    ejercicio?: string;
  }>;
}) {
  const [{ id }, query, user] = await Promise.all([params, searchParams, requireUser()]);
  const nuevo = typeof query.nuevo === "string" ? query.nuevo : undefined,
    logros = typeof query.logros === "string" ? query.logros : undefined;
  const db = await createClient();
  const result = await getWorkoutResult(db, id);
  if (!result) notFound();
  if (result.kind === "typed")
    return (
      <TypedWorkoutResult
        workout={result.workout}
        studentId={result.studentId}
        user={user}
        query={query}
      />
    );
  const workout = result.workout;
  const [records, comments, unread] = await Promise.all([
    getWorkoutRecords(db, id),
    listComments({ db, workoutId: id, viewerId: user.id, studentId: workout.studentId }),
    getUnreadSummary(db).catch(() => null),
  ]);

  const own = workout.studentId === user.id;
  const back = evidenceReturn(
    navigationContext(query),
    workout.studentId,
    own,
    query,
    workout.exercises.map((e) => e.exerciseId),
  );

  // Solo se anuncian logros que el alumno realmente tiene (la dirección no es de fiar).
  const announced =
    nuevo && own && logros
      ? await listAchievements(db, user.id).then((earned) => {
          const have = new Set<string>(earned.map((a) => a.kind));
          return logros
            .split(",")
            .filter(isAchievementKind)
            .filter((kind) => have.has(kind));
        })
      : [];
  const { summary } = workout;

  return (
    <div className="flow-page flex flex-col gap-4">
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

      <MarkRead workoutId={id} unread={unread?.byWorkout.get(id) ?? 0} />

      {announced.length > 0 ? <NewAchievements kinds={announced} /> : null}

      <header>
        <h1 className="text-xl font-semibold">
          {capitalizeFirst(dayFormat.format(new Date(`${workout.performedOn}T00:00:00Z`)))}
        </h1>
        <p className="text-sm text-muted-foreground">
          {workout.programName ? `${workout.programName} · ` : ""}
          {workoutTitle(workout)}
          {workout.sourceKind && workout.sourceKind !== "assigned"
            ? ` · ${workoutOriginLabel(workout.sourceKind)}`
            : ""}
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

      {workout.perceivedEffort != null || workout.note ? (
        <section aria-label="Valoración del entrenamiento" className="rounded-lg border p-4">
          <h2 className="font-semibold">Cómo se sintió</h2>
          {workout.perceivedEffort != null ? (
            <p className="mt-2 text-sm">
              Esfuerzo percibido: <strong>{workout.perceivedEffort}/10</strong>
            </p>
          ) : null}
          {workout.note ? (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{workout.note}</p>
          ) : null}
        </section>
      ) : null}

      {workout.exercises.map((exercise) => (
        <Card key={exercise.position}>
          <CardHeader>
            <CardTitle className="text-base">{exercise.name}</CardTitle>
            {exercise.prescribedExerciseId &&
            exercise.prescribedExerciseId !== exercise.exerciseId ? (
              <p className="text-sm text-muted-foreground">
                En lugar de {exercise.prescribedExerciseName}
              </p>
            ) : null}
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

      <CommentsSection workoutId={workout.id} comments={comments} viewerRole={user.role} />

      <div className="flex flex-wrap gap-2">
        {nuevo && own ? <Button render={<Link href="/week" />}>Volver a mi semana</Button> : null}
        <Button variant="outline" render={<Link href={back.href} />}>
          {back.label}
        </Button>
        {own && isWorkoutEditable(workout.performedOn, santiagoDate(new Date())) ? (
          <>
            <Button variant="secondary" render={<Link href={`/history/${workout.id}/edit`} />}>
              Editar
            </Button>
            <Button variant="outline" render={<Link href={`/history/${workout.id}/remove`} />}>
              Eliminar entrenamiento
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
