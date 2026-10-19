import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, Circle, Clock, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StreakChip } from "@/components/streak/streak-chip";
import { WeekStrip } from "./week-strip";
import { buildWeekStrip, nextPendingSession } from "@/domain/week-strip";
import type { WeekSession, WeekView } from "@/lib/data/week";

const day = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone: "UTC" });
const fmt = (date: string) => day.format(new Date(`${date}T00:00:00Z`));

function NextSessionCard({
  session,
  trainedToday,
}: {
  session: WeekSession;
  trainedToday: boolean;
}) {
  const shown = session.exerciseNames.slice(0, 5);
  const more = session.exerciseNames.length - shown.length;
  return (
    <section
      aria-label="Próxima sesión"
      className="flex flex-col overflow-hidden rounded-2xl border border-primary/25 bg-card"
    >
      <div className="flex items-center justify-between border-b border-primary/10 bg-primary/5 px-5 py-3 sm:px-6">
        <p className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">
          {trainedToday ? "Siguiente sesión" : "Hoy toca"}
        </p>
        <Dumbbell className="size-5 text-primary" aria-hidden />
      </div>
      <div className="flex flex-1 flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Sesión {session.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {session.exerciseCount} {session.exerciseCount === 1 ? "ejercicio" : "ejercicios"} · A
            tu ritmo, serie a serie.
          </p>
        </div>
        <ul className="order-2 flex flex-col divide-y divide-border/60 text-sm lg:order-1">
          {shown.map((name, i) => (
            <li key={`${name}-${i}`} className="flex items-center gap-3 py-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-xs font-medium text-muted-foreground tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{name}</span>
            </li>
          ))}
          {more > 0 ? <li className="pt-3 text-muted-foreground">y {more} más</li> : null}
        </ul>
        <Button
          size="lg"
          className="order-1 w-full justify-between lg:order-2 lg:mt-auto"
          render={<Link href={`/workout/${session.sessionId}`} />}
        >
          Empezar
          <ArrowRight className="size-5" aria-hidden />
        </Button>
      </div>
    </section>
  );
}

function SessionRow({ session }: { session: WeekSession }) {
  const done = session.status === "done";
  return (
    <li className="flex min-h-20 items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <span
        className={
          done
            ? "grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10"
            : "grid size-10 shrink-0 place-items-center rounded-xl bg-muted"
        }
      >
        {done ? (
          <CheckCircle2 className="size-5 text-primary" aria-hidden />
        ) : (
          <Circle className="size-5 text-muted-foreground" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Sesión {session.label}</p>
        <p className="text-xs text-muted-foreground">
          {session.exerciseCount} {session.exerciseCount === 1 ? "ejercicio" : "ejercicios"} ·{" "}
          {done ? "Hecha" : "Pendiente"}
        </p>
      </div>
      {done ? (
        <div className="flex flex-col items-end">
          <Button variant="outline" render={<Link href={`/history/${session.workoutId}`} />}>
            Ver
          </Button>
          <Link
            href={`/workout/${session.sessionId}`}
            className="inline-flex min-h-11 items-center text-xs text-primary underline-offset-4 hover:underline"
          >
            Repetir (extra)
          </Link>
        </div>
      ) : (
        <Button variant="outline" render={<Link href={`/workout/${session.sessionId}`} />}>
          Empezar
        </Button>
      )}
    </li>
  );
}

export function WeekOverview({
  view,
  today,
  streak,
}: {
  view: Extract<WeekView, { kind: "active" }>;
  today: string;
  streak: { current: number; longest: number };
}) {
  const next = nextPendingSession(view.sessions);
  const others = view.sessions.filter((session) => session !== next);
  const percent =
    view.compliance.planned > 0
      ? Math.round((view.compliance.done / view.compliance.planned) * 100)
      : 0;
  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Tu semana de entrenamiento"
        className="rounded-2xl border bg-card p-4 sm:p-6"
      >
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Tu programa</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">{view.program.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Semana {view.weekNumber} de {view.program.weeksCount} · {fmt(view.weekStart)} —{" "}
              {fmt(view.weekEnd)}
            </p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {view.compliance.done}/{view.compliance.planned} sesiones
          </span>
        </div>
        <WeekStrip days={buildWeekStrip(view.weekStart, today, view.trainedDates)} />
        {!view.compliance.deload ? (
          <div className="mt-4 border-t pt-4 sm:mt-6 sm:pt-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p role="status" className="text-sm font-medium">
                {view.allDone
                  ? "¡Completaste todas las sesiones de la semana!"
                  : `Llevas ${view.compliance.done} de ${view.compliance.planned} sesiones`}
              </p>
              {view.allDone ? <Check className="size-5 shrink-0 text-primary" aria-hidden /> : null}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
          </div>
        ) : null}
      </section>
      {view.compliance.deload ? (
        <Card>
          <CardContent className="flex items-center gap-4">
            <Clock className="size-7 text-primary" aria-hidden />
            <div>
              <h2 className="font-semibold">Semana de descarga</h2>
              <p className="text-sm text-muted-foreground">
                Esta semana no tienes sesiones planificadas. Descansa.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div
          className={
            next && others.length > 0
              ? "grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]"
              : "grid gap-6"
          }
        >
          {next ? (
            <NextSessionCard session={next} trainedToday={view.trainedDates.includes(today)} />
          ) : null}
          {others.length > 0 ? (
            <section aria-labelledby="week-sessions-heading">
              <h2 id="week-sessions-heading" className="mb-3 text-sm font-semibold">
                {next ? "El resto de tu semana" : "Tus sesiones"}
              </h2>
              <ul aria-label="Sesiones de la semana" className="flex flex-col gap-3">
                {others.map((session) => (
                  <SessionRow key={session.sessionId} session={session} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
      {view.extraCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          {view.extraCount} {view.extraCount === 1 ? "sesión extra" : "sesiones extra"} esta semana.
        </p>
      ) : null}
      <StreakChip current={streak.current} longest={streak.longest} />
    </div>
  );
}
