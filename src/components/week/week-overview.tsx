import Link from "next/link";
import { Check, ChevronRight, Clock, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StreakChip } from "@/components/streak/streak-chip";
import { WeekStrip } from "./week-strip";
import { buildWeekStrip, nextPendingSession } from "@/domain/week-strip";
import type { WeekSession, WeekView } from "@/lib/data/week";
import { cn } from "@/lib/utils";

const day = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone: "UTC" });
const fmt = (date: string) => day.format(new Date(`${date}T00:00:00Z`));

function RoutineCard({
  session,
  next,
  trainedToday,
}: {
  session: WeekSession;
  next: boolean;
  trainedToday: boolean;
}) {
  const done = session.status === "done";
  const names = session.exerciseNames.slice(0, 4);
  return (
    <section
      aria-label={next ? "Próxima sesión" : undefined}
      className={cn(
        "flex h-full flex-col rounded-lg border bg-card p-4",
        next && "border-primary/60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">
          Sesión {session.label}
          {session.title ? ` · ${session.title}` : ""}
        </h3>
        {next ? (
          <span className="rounded bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
            {trainedToday ? "Siguiente sesión" : "Hoy toca"}
          </span>
        ) : done ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <Check className="size-4" aria-hidden />
            Hecha
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Pendiente</span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {session.exerciseCount} {session.exerciseCount === 1 ? "ejercicio" : "ejercicios"}
      </p>
      <ul className="my-4 flex flex-1 flex-col gap-2.5">
        {names.map((name, i) => (
          <li key={`${name}-${i}`} className="flex items-center gap-2.5 text-sm">
            <span className="grid size-7 shrink-0 place-items-center rounded bg-muted">
              <Dumbbell className="size-4 text-muted-foreground" aria-hidden />
            </span>
            <span className="min-w-0 truncate">{name}</span>
          </li>
        ))}
        {session.exerciseCount > names.length ? (
          <li className="pl-9 text-xs text-muted-foreground">
            + {session.exerciseCount - names.length} más
          </li>
        ) : null}
      </ul>
      {done ? (
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            render={<Link href={`/history/${session.workoutId}`} />}
          >
            Ver
          </Button>
          <Link
            href={`/workout/${session.sessionId}`}
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
          >
            Repetir (extra)
          </Link>
        </div>
      ) : (
        <Button
          className="w-full"
          variant={next ? "default" : "secondary"}
          render={<Link href={`/workout/${session.sessionId}`} />}
        >
          Empezar
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      )}
    </section>
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
  const percent =
    view.compliance.planned > 0
      ? Math.round((view.compliance.done / view.compliance.planned) * 100)
      : 0;
  const ordered = next
    ? [next, ...view.sessions.filter((session) => session !== next)]
    : view.sessions;
  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Tu semana de entrenamiento" className="border-b pb-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{view.program.name}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Semana {view.weekNumber} de {view.program.weeksCount} · {fmt(view.weekStart)} —{" "}
              {fmt(view.weekEnd)}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {view.compliance.done}
            <span className="font-normal text-muted-foreground">/{view.compliance.planned}</span>
          </span>
        </div>
        <WeekStrip days={buildWeekStrip(view.weekStart, today, view.trainedDates)} />
        {!view.compliance.deload ? (
          <div className="mt-3">
            <p role="status" className="mb-2 text-xs text-muted-foreground">
              {view.allDone
                ? "¡Completaste todas las sesiones de la semana!"
                : `Llevas ${view.compliance.done} de ${view.compliance.planned} sesiones`}
            </p>
            <div className="h-1 overflow-hidden rounded bg-muted" aria-hidden>
              <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
          </div>
        ) : null}
      </section>
      {view.compliance.deload ? (
        <section className="flex items-center gap-3 rounded-lg border p-4">
          <Clock className="size-6 text-primary" aria-hidden />
          <div>
            <h2 className="font-semibold">Semana de descarga</h2>
            <p className="text-sm text-muted-foreground">
              Esta semana no tienes sesiones planificadas. Descansa.
            </p>
          </div>
        </section>
      ) : (
        <section aria-labelledby="week-sessions-heading">
          <h2 id="week-sessions-heading" className="mb-3 text-lg font-semibold">
            Tus rutinas
          </h2>
          <ul
            aria-label="Sesiones de la semana"
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          >
            {ordered.map((session) => (
              <li key={session.sessionId}>
                <RoutineCard
                  session={session}
                  next={session === next}
                  trainedToday={view.trainedDates.includes(today)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {view.extraCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {view.extraCount} {view.extraCount === 1 ? "sesión extra" : "sesiones extra"} esta semana.
        </p>
      ) : null}
      <StreakChip current={streak.current} longest={streak.longest} />
    </div>
  );
}
