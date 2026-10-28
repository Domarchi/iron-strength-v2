import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CommentsSection } from "@/components/comments/comments-section";
import { MarkRead } from "@/components/unread/mark-read";
import { isWorkoutEditable } from "@/domain/edit-window";
import { santiagoDate } from "@/domain/dates";
import { formatDuration, formatKg } from "@/domain/format";
import { formatTrainingMetrics } from "@/domain/training-metrics";
import { workoutTitle, workoutOriginLabel } from "@/domain/workout-title";
import type { CurrentUser } from "@/lib/auth/session";
import type { TypedWorkout } from "@/lib/mobile/typed-recording-contracts";
import { listComments } from "@/lib/data/comments";
import { getUnreadSummary } from "@/lib/data/unread";
import { createClient } from "@/lib/supabase/server";
import { evidenceReturn, navigationContext } from "@/lib/navigation/training-context";

const classes = {
  working: "Trabajo",
  warmup: "Calentamiento",
  failure: "Al fallo",
  drop: "Descendente",
};
const day = new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "UTC" });
const number = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 2 });

export async function TypedWorkoutResult({
  workout,
  studentId,
  user,
  query,
}: {
  workout: TypedWorkout["workout"];
  studentId: string;
  user: CurrentUser;
  query: { semanas?: string; vista?: string; desde?: string; ejercicio?: string };
}) {
  const db = await createClient();
  const [comments, unread] = await Promise.all([
    listComments({ db, workoutId: workout.id, viewerId: user.id, studentId }),
    getUnreadSummary(db).catch(() => null),
  ]);
  const own = studentId === user.id;
  const back = evidenceReturn(
    navigationContext(query),
    studentId,
    own,
    query,
    workout.exercises.map((row) => row.exerciseId),
  );
  const summary = workout.summary;
  return (
    <div className="flow-page flex flex-col gap-4">
      <MarkRead workoutId={workout.id} unread={unread?.byWorkout.get(workout.id) ?? 0} />
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">
          {day.format(new Date(`${workout.performedOn}T00:00:00Z`))}
        </p>
        <h1 className="text-xl font-semibold wrap-anywhere">{workoutTitle(workout)}</h1>
        <p className="text-sm text-muted-foreground wrap-anywhere">
          {workout.programName ? `${workout.programName} · ` : ""}
          {workoutOriginLabel(workout.sourceKind)}
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Duración", formatDuration(workout.durationSeconds)],
          ["Series de trabajo", number(summary.workingSets)],
          ["Volumen externo", summary.volumeKg > 0 ? formatKg(summary.volumeKg) : "—"],
          ["Ejercicios realizados", number(summary.exerciseCount)],
          ...(summary.recordedSeconds > 0
            ? [["Tiempo registrado", `${number(summary.recordedSeconds)} s`]]
            : []),
          ...(summary.distanceMeters > 0
            ? [["Distancia registrada", `${number(summary.distanceMeters)} m`]]
            : []),
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums wrap-anywhere">{value}</dd>
          </div>
        ))}
      </dl>
      {workout.perceivedEffort !== null || workout.note ? (
        <section
          aria-label="Valoración del entrenamiento"
          className="space-y-2 rounded-lg border p-4"
        >
          <h2 className="font-medium">Cómo se sintió</h2>
          {workout.perceivedEffort !== null ? (
            <p className="text-sm">Esfuerzo percibido: {workout.perceivedEffort}/10</p>
          ) : null}
          {workout.note ? (
            <p className="whitespace-pre-wrap text-sm wrap-anywhere">{workout.note}</p>
          ) : null}
        </section>
      ) : null}
      {workout.exercises.map((exercise) => (
        <Card key={exercise.id} role="region" aria-label={exercise.name}>
          <CardHeader>
            <h2 className="text-base font-medium wrap-anywhere">{exercise.name}</h2>
            {exercise.prescribedExerciseName &&
            exercise.prescribedExerciseId !== exercise.exerciseId ? (
              <p className="text-sm text-muted-foreground">
                En lugar de {exercise.prescribedExerciseName}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {exercise.sets.length ? (
              <ol className="divide-y">
                {exercise.sets.map((set) => (
                  <li
                    key={set.id}
                    className="flex min-w-0 flex-wrap items-start justify-between gap-2 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">
                      Serie {set.setNumber} · {classes[set.setType]}
                    </span>
                    <span className="text-right tabular-nums wrap-anywhere">
                      {formatTrainingMetrics(set.metrics)}
                      {set.effort !== null ? (
                        <span className="block text-xs text-muted-foreground">
                          Esfuerzo {number(set.effort)}/10
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">Sin series realizadas</p>
            )}
            {exercise.athleteNote ? (
              <p className="whitespace-pre-wrap text-sm wrap-anywhere">{exercise.athleteNote}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
      <CommentsSection workoutId={workout.id} comments={comments} viewerRole={user.role} />
      <div className="flex flex-wrap gap-2">
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
