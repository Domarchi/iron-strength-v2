"use client";

import { useSyncExternalStore } from "react";
import { listDrafts } from "@/lib/workout/draft";
import { localAssignedTrainings } from "@/lib/workout/local-typed-training";
import { orderScheduledSessions, scheduleState, WEEKDAYS } from "@/domain/session-schedule";
import { SessionStart } from "./session-start";
import { RoutinePreview } from "./routine-preview";
import { SessionDayPicker } from "./session-day-picker";
import Link from "next/link";
import Image from "next/image";
import { Check, ChevronRight, Clock, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StreakChip } from "@/components/streak/streak-chip";
import { WeekStrip } from "./week-strip";
import { buildWeekStrip, nextPendingSession } from "@/domain/week-strip";
import type { WeekSession, WeekView } from "@/lib/data/week";
import { cn } from "@/lib/utils";

function subscribeDrafts(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener("focus", notify);
  window.addEventListener("offline-queue", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener("focus", notify);
    window.removeEventListener("offline-queue", notify);
  };
}

const day = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone: "UTC" });
const fmt = (date: string) => day.format(new Date(`${date}T00:00:00Z`));

function RoutineCard({
  userId,
  session,
  next,
  trainedToday,
  today,
}: {
  userId: string;
  session: WeekSession;
  next: boolean;
  trainedToday: boolean;
  today: string;
}) {
  const done = session.status === "done";
  const planned = scheduleState(session.status, session.scheduledOn ?? null, today) === "planned";
  const counts = `${session.exerciseCount} ${session.exerciseCount === 1 ? "ejercicio" : "ejercicios"}${session.setCount === undefined ? "" : ` · ${session.setCount} series`}`;
  return (
    <section
      aria-label={next ? "Próxima sesión" : undefined}
      className={cn("routine-card", next ? "routine-featured" : "routine-compact")}
    >
      {next ? (
        <>
          <picture>
            <source media="(min-width: 768px)" srcSet="/design/azul-atleta/hero-1536-v1.webp" />
            <Image
              src="/design/azul-atleta/hero-768-v1.webp"
              alt=""
              fill
              unoptimized
              loading="eager"
              fetchPriority="high"
              className="week-hero-image object-cover"
              sizes="(max-width: 767px) 100vw, 600px"
            />
          </picture>
          <div className="routine-hero-content">
            <p className="routine-kicker">
              {planned || trainedToday ? "Siguiente sesión" : "Hoy toca"}
            </p>
            <h3 className="mt-3 text-base font-medium">Sesión {session.label}</h3>
            <p className="mt-1 text-3xl leading-tight font-bold tracking-tight">
              {session.title || "Tu próximo entrenamiento"}
            </p>
            <p className="mt-2 text-sm text-blue-100">{counts}</p>
            <p className="mt-1 truncate text-xs text-blue-100">
              {session.exerciseNames.slice(0, 3).join(" · ")}
            </p>
            <SessionStart userId={userId} sessionId={session.sessionId} featured />
            <RoutinePreview sessionId={session.sessionId} label={session.label} />
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <span className={cn("routine-status", done && "routine-done")} aria-hidden>
            {done ? <Check className="size-5" /> : <Dumbbell className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs text-muted-foreground">Sesión {session.label}</h3>
            <p className="text-base leading-tight font-semibold">
              {session.title || session.exerciseNames.slice(0, 2).join(" + ") || "Entrenamiento"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{counts}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <span
              className={cn(
                "text-xs font-semibold",
                done ? "text-success" : "text-muted-foreground",
              )}
            >
              {done ? "Hecha" : planned ? "Prevista" : "Pendiente"}
            </span>
            {done ? (
              <Button
                variant="ghost"
                className="px-1"
                render={<Link href={`/history/${session.workoutId}`} />}
              >
                Ver
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            ) : (
              <SessionStart userId={userId} sessionId={session.sessionId} />
            )}
          </div>
        </div>
      )}
      {session.scheduledOn || done ? (
        <div className="routine-details">
          {session.scheduledOn ? (
            <p className="text-xs text-muted-foreground">
              {session.scheduledOn
                ? `${planned ? "Prevista" : done ? "Programada" : "Pendiente"}: ${WEEKDAYS[session.overrideWeekday ?? session.weekday ?? 0]} ${fmt(session.scheduledOn)}`
                : ""}
            </p>
          ) : null}
          {done ? (
            <Link
              href={`/workout/${session.sessionId}`}
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
            >
              Repetir (extra)
            </Link>
          ) : null}
        </div>
      ) : null}
      <SessionDayPicker
        compact
        sessionId={session.sessionId}
        label={session.label}
        prescribed={session.weekday ?? null}
        override={session.overrideWeekday ?? null}
      />
    </section>
  );
}

export function WeekOverview({
  userId,
  view,
  today,
  streak,
}: {
  userId: string;
  view: Extract<WeekView, { kind: "active" }>;
  today: string;
  streak: { current: number; longest: number } | null;
}) {
  const scheduled = orderScheduledSessions(view.sessions);
  const resumeId = useSyncExternalStore(
    subscribeDrafts,
    () => {
      try {
        const typed = localAssignedTrainings(window.localStorage, userId).find(
          (r) =>
            r.phase === "in_progress" &&
            view.sessions.some((s) => s.status !== "done" && s.sessionId === r.sessionId),
        );
        if (typed) return typed.sessionId;
        return (
          listDrafts(window.localStorage, userId)
            .filter(
              (d) =>
                d.status === "in_progress" &&
                view.sessions.some(
                  (s) => s.status !== "done" && s.sessionId === d.plannedSessionId,
                ),
            )
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.plannedSessionId ?? ""
        );
      } catch {
        return "";
      }
    },
    () => "",
  );
  const next = scheduled.find((s) => s.sessionId === resumeId) ?? nextPendingSession(scheduled);
  const percent =
    view.compliance.planned > 0
      ? Math.round((view.compliance.done / view.compliance.planned) * 100)
      : 0;
  const ordered = next ? [next, ...scheduled.filter((session) => session !== next)] : scheduled;
  return (
    <div className="week-overview flex flex-col">
      <section aria-label="Tu semana de entrenamiento" className="week-summary pb-4">
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
        <section className="mt-4 flex items-center gap-3 rounded-lg border bg-card p-4">
          <Clock className="size-6 text-primary" aria-hidden />
          <div>
            <h2 className="font-semibold">Semana de descarga</h2>
            <p className="text-sm text-muted-foreground">
              Esta semana no tienes sesiones planificadas. Descansa.
            </p>
          </div>
        </section>
      ) : (
        <section aria-labelledby="week-sessions-heading" className="week-routines">
          <h2 id="week-sessions-heading" className="sr-only">
            Tus rutinas
          </h2>
          <ul aria-label="Sesiones de la semana" className="routine-list grid gap-3">
            {ordered.map((session) => (
              <li key={session.sessionId}>
                <RoutineCard
                  userId={userId}
                  session={session}
                  next={session === next}
                  trainedToday={view.trainedDates.includes(today)}
                  today={today}
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
      {streak ? <StreakChip current={streak.current} longest={streak.longest} /> : null}
    </div>
  );
}
