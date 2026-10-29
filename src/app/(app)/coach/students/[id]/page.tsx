import { workoutTitle } from "@/domain/workout-title";
import {
  navigationContext,
  studentHref,
  programHref,
  adaptHref,
  workoutHref,
} from "@/lib/navigation/training-context";
import { summarizeUnread } from "@/domain/unread";
import { StatusMessage } from "@/components/ui/status-message";
import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnreadBadge } from "@/components/unread/unread-badge";
import { AchievementsList } from "@/components/achievements/achievements-list";
import { ConstancyStrip } from "@/components/streak/constancy-strip";
import { ConstancyReadFailure } from "@/components/streak/read-failure";
import { santiagoDate } from "@/domain/dates";
import { formatDuration, formatKg } from "@/domain/format";
import { programState } from "@/domain/program-weeks";
import { getAchievementsOverview } from "@/lib/data/achievements";
import { listUnread } from "@/lib/data/unread";
import { listAssignedPrograms } from "@/lib/data/programs";
import { getVisibleTrainingProgress } from "@/lib/data/training-review";
import { TrainingExerciseList } from "@/components/progress/typed-exercise-list";
import { ProgressReadFailure } from "@/components/progress/read-failure";
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

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    semanas?: string | string[];
    vista?: string | string[];
    tipo?: string | string[];
    metrica?: string | string[];
  }>;
}) {
  const navigation = navigationContext(await searchParams);
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

  const [constancyResult, workouts, reviewResult, programs, unreadRows] = await Promise.all([
    getStreakSummary(db, id, today)
      .then(async (streak) => ({
        streak,
        achievements: await getAchievementsOverview(db, id, streak.longest),
      }))
      .then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
    listWorkouts(db, id, { limit: 10 }),
    getVisibleTrainingProgress(db, id).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
    listAssignedPrograms(db, id),
    listUnread(db).catch(() => null),
  ]);

  const pendingComments =
    unreadRows
      ?.filter((r) => r.studentId === id)
      .sort((a, b) => Date.parse(b.lastCommentAt) - Date.parse(a.lastCommentAt)) ?? null;
  const unread = unreadRows ? summarizeUnread(unreadRows) : null;
  const stateOf = (p: (typeof programs)[number]) =>
    p.startDate && p.endsOn
      ? programState({ startDate: p.startDate, endsOn: p.endsOn, weeksCount: p.weeksCount }, today)
      : null;
  const activeProgram = programs.find((p) => stateOf(p) === "active");
  const nextProgram = programs
    .filter((p) => stateOf(p) === "scheduled")
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!))[0];
  const highlighted = activeProgram ?? nextProgram;
  const latest = workouts.items[0];
  const pendingCount = pendingComments?.reduce((n, r) => n + r.count, 0) ?? null;

  return (
    <div className="flow-page flex flex-col gap-6">
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

      <section aria-label="Resumen del alumno" className="grid gap-3 lg:grid-cols-3">
        <Card className="border-primary/20 bg-linear-to-br from-primary/10 via-card to-card">
          <CardHeader>
            <CardTitle className="text-sm">
              {activeProgram
                ? "Programa vigente"
                : nextProgram
                  ? "Próximo programa"
                  : "Planificación"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-lg font-semibold">
              {highlighted?.name ?? "Preparar su siguiente etapa"}
            </p>
            {highlighted?.startDate && highlighted.endsOn ? (
              <p className="text-sm text-muted-foreground">
                {fmt(highlighted.startDate)} al {fmt(highlighted.endsOn)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {programs.length
                  ? "Su programa terminó."
                  : "Todavía no tiene un programa asignado."}
              </p>
            )}
            <Button
              render={
                <Link
                  href={
                    highlighted
                      ? programHref(highlighted.id, navigation, id)
                      : adaptHref(navigation, id)
                  }
                />
              }
            >
              {activeProgram
                ? "Abrir programa vigente"
                : nextProgram
                  ? "Ver próximo programa"
                  : "Preparar un programa"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Último entrenamiento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {latest ? (
              <>
                <p className="text-lg font-semibold">{fmt(latest.performedOn)}</p>
                <p className="text-sm text-muted-foreground">
                  {latest.workingSets} series · {formatDuration(latest.durationSeconds)}
                </p>
                <Button
                  variant="outline"
                  render={<Link href={workoutHref(latest.id, navigation, id)} />}
                >
                  Revisar último entrenamiento
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aquí verás el primer entrenamiento que registre.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Comentarios pendientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl font-bold tabular-nums text-primary">
              {pendingCount ?? "Sin comprobar"}
            </p>
            <p className="text-sm text-muted-foreground">
              {pendingCount === null
                ? "No se pudo consultar su estado."
                : pendingCount
                  ? "Abre la evidencia para revisar y responder."
                  : "Todo revisado."}
            </p>
            <Button variant="outline" render={<Link href="#student-pending-comments" />}>
              Revisar comentarios
            </Button>
          </CardContent>
        </Card>
      </section>
      <section
        id="student-pending-comments"
        aria-label="Comentarios pendientes del alumno"
        className="space-y-3 scroll-mt-20"
      >
        <h2 className="text-lg font-semibold">Conversaciones por revisar</h2>
        {pendingComments === null ? (
          <>
            <StatusMessage error>
              No se pudieron cargar los comentarios pendientes. Tus datos se conservan.
            </StatusMessage>
            <Button variant="outline" render={<a href={studentHref(id, navigation)} />}>
              Reintentar consulta
            </Button>
          </>
        ) : pendingComments.length ? (
          <ul className="flow-list divide-y rounded-lg border">
            {pendingComments.map((r) => (
              <li key={r.workoutId}>
                <Link
                  href={workoutHref(r.workoutId, navigation, id)}
                  className="flex min-h-14 flex-wrap items-center justify-between gap-2 p-3 text-sm hover:bg-muted/50"
                >
                  <span className="font-medium text-primary">
                    Revisar {r.count} {r.count === 1 ? "comentario" : "comentarios"}
                  </span>
                  <span className="text-muted-foreground">
                    {new Intl.DateTimeFormat("es-CL", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "America/Santiago",
                    }).format(new Date(r.lastCommentAt))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No hay comentarios pendientes.</p>
        )}
      </section>
      <nav
        aria-label="Periodo de progreso del alumno"
        className="flex flex-wrap items-center gap-2"
      >
        <span className="mr-1 text-sm text-muted-foreground">Consultar progreso:</span>
        {([4, 8, 12] as const).map((weeks) => (
          <Link
            key={weeks}
            href={studentHref(id, { ...navigation, weeks })}
            aria-current={navigation.weeks === weeks ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-medium ${navigation.weeks === weeks ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
          >
            {weeks} semanas
          </Link>
        ))}
      </nav>
      {constancyResult.ok ? (
        <ConstancyStrip {...constancyResult.value.streak} />
      ) : (
        <ConstancyReadFailure
          error={constancyResult.error}
          retryHref={studentHref(id, navigation)}
        />
      )}

      <div>
        <Button variant="outline" render={<a href={`/export/history?alumno=${id}`} download />}>
          <Download aria-hidden /> Exportar historial (CSV)
        </Button>
      </div>

      {constancyResult.ok ? <AchievementsList {...constancyResult.value.achievements} /> : null}

      <section aria-labelledby="programs-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="programs-heading" className="text-lg font-medium">
            Programas
          </h2>
          <Button variant="outline" render={<Link href={adaptHref(navigation, id)} />}>
            Asignar un programa
          </Button>
        </div>
        {programs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este alumno no tiene programas asignados.</p>
        ) : (
          <ul className="flow-list divide-y rounded-lg border">
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
                    href={programHref(p.id, navigation, id)}
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
          <ul className="flow-list divide-y rounded-lg border">
            {workouts.items.map((w) => (
              <li key={w.id}>
                <Link
                  href={workoutHref(w.id, navigation, id)}
                  className="flex min-h-14 flex-col justify-center gap-0.5 p-3 hover:bg-muted/50"
                >
                  <span className="flex items-center gap-2 font-medium">
                    {fmt(w.performedOn)}
                    <UnreadBadge count={unread?.byWorkout.get(w.id) ?? 0} />
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {workoutTitle(w)} · {w.workingSets} series · {formatDuration(w.durationSeconds)}
                    {w.volumeKg > 0 ? ` · ${formatKg(w.volumeKg)}` : ""}
                  </span>
                  {w.perceivedEffort != null ? (
                    <span className="text-sm">Esfuerzo: {w.perceivedEffort}/10</span>
                  ) : null}
                  {w.note ? (
                    <span className="line-clamp-3 break-words text-sm text-muted-foreground">
                      {w.note}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="body-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="body-heading" className="text-lg font-medium">
            Medidas y fotos
          </h2>
          <Button variant="outline" render={<Link href={`/body?alumno=${id}`} />}>
            Ver
          </Button>
        </div>
      </section>

      <section aria-labelledby="records-heading" className="flex flex-col gap-3">
        <h2 id="records-heading" className="text-lg font-medium">
          Mejores marcas
        </h2>
        {!reviewResult.ok || !reviewResult.value ? (
          <ProgressReadFailure
            error={reviewResult.ok ? new Error("No disponible") : reviewResult.error}
            retryHref={studentHref(id, navigation)}
          />
        ) : reviewResult.value.progress.exercises.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay marcas registradas.</p>
        ) : (
          <TrainingExerciseList
            exercises={reviewResult.value.progress.exercises}
            navigation={navigation}
            studentId={id}
          />
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
