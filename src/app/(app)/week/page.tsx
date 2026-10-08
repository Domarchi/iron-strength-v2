import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle2, ChevronRight, Circle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { santiagoDate } from "@/domain/dates";
import { StreakChip } from "@/components/streak/streak-chip";
import { WeekStrip } from "@/components/week/week-strip";
import { buildWeekStrip, nextPendingSession } from "@/domain/week-strip";
import { getStreakSummary } from "@/lib/data/streak";
import { getWeekView, type WeekSession } from "@/lib/data/week";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Mi semana · Iron Strength" };

const day = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", timeZone: "UTC" });
const fmt = (date: string) => day.format(new Date(`${date}T00:00:00Z`));

// Tarjeta destacada con la próxima sesión (RF-62): qué toca y un botón grande para empezar.
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
      className="flex flex-col gap-3 rounded-2xl border border-primary/50 bg-card p-4"
    >
      <div>
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">
          {trainedToday ? "Siguiente sesión" : "Hoy toca"}
        </p>
        <h2 className="text-2xl font-bold">Sesión {session.label}</h2>
        <p className="text-sm text-muted-foreground">
          {session.exerciseCount} {session.exerciseCount === 1 ? "ejercicio" : "ejercicios"}
        </p>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {shown.map((name, i) => (
          <li key={`${name}-${i}`} className="flex gap-2">
            <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
            <span>{name}</span>
          </li>
        ))}
        {more > 0 ? <li className="text-muted-foreground">y {more} más</li> : null}
      </ul>
      <Button size="lg" className="w-full" render={<Link href={`/workout/${session.sessionId}`} />}>
        Empezar
      </Button>
    </section>
  );
}

// Fila compacta para las demás sesiones de la semana.
function SessionRow({ session }: { session: WeekSession }) {
  const done = session.status === "done";
  return (
    <li className="flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2">
      {done ? (
        <CheckCircle2 className="size-6 shrink-0 text-primary" aria-hidden />
      ) : (
        <Circle className="size-6 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium">Sesión {session.label}</p>
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
            className="py-1 text-xs text-primary underline-offset-4 hover:underline"
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

async function WeekContent() {
  const user = await requireUser();
  const db = await createClient();
  const today = santiagoDate(new Date());
  const [view, streak] = await Promise.all([
    getWeekView(db, user.id, today),
    getStreakSummary(db, user.id, today),
  ]);
  const showStreak = view.kind !== "no_program";

  switch (view.kind) {
    case "no_program":
      return (
        <Card>
          <CardContent className="flex flex-col gap-1 pt-6">
            <p className="font-medium">Todavía no tienes un programa asignado.</p>
            <p className="text-sm text-muted-foreground">
              {user.role === "coach"
                ? "Asígnate una plantilla desde Programas para empezar a entrenar."
                : "Habla con tu coach para que te asigne uno."}
            </p>
          </CardContent>
        </Card>
      );

    case "scheduled":
      return (
        <Card>
          <CardContent className="flex flex-col gap-1 pt-6">
            <p className="font-medium">{view.program.name}</p>
            <p className="text-sm text-muted-foreground">
              Tu programa empieza el {fmt(view.program.startDate)}.
            </p>
          </CardContent>
        </Card>
      );

    case "finished":
      return (
        <Card>
          <CardContent className="flex flex-col gap-1 pt-6">
            <p className="font-medium">Terminaste “{view.program.name}”. ¡Buen trabajo!</p>
            <p className="text-sm text-muted-foreground">
              Cuando tu coach te asigne el siguiente programa, aparecerá aquí.
            </p>
          </CardContent>
        </Card>
      );

    case "active": {
      const strip = buildWeekStrip(view.weekStart, today, view.trainedDates);
      const next = nextPendingSession(view.sessions);
      const others = view.sessions.filter((s) => s !== next);
      const trainedToday = view.trainedDates.includes(today);
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {view.program.name} · semana {view.weekNumber} de {view.program.weeksCount} · del{" "}
            {fmt(view.weekStart)} al {fmt(view.weekEnd)}
          </p>

          <WeekStrip days={strip} />

          {view.compliance.deload ? (
            <Card>
              <CardContent className="flex items-center gap-3 pt-6">
                <Clock className="size-6 text-muted-foreground" aria-hidden />
                <div>
                  <p className="font-medium">Semana de descarga</p>
                  <p className="text-sm text-muted-foreground">
                    Esta semana no tienes sesiones planificadas. Descansa.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <p role="status" className="font-medium">
                {view.allDone
                  ? "¡Completaste todas las sesiones de la semana!"
                  : `Llevas ${view.compliance.done} de ${view.compliance.planned} sesiones`}
              </p>
              {next ? <NextSessionCard session={next} trainedToday={trainedToday} /> : null}
              {others.length > 0 ? (
                <ul aria-label="Sesiones de la semana" className="flex flex-col gap-2">
                  {others.map((session) => (
                    <SessionRow key={session.sessionId} session={session} />
                  ))}
                </ul>
              ) : null}
              {view.extraCount > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {view.extraCount} {view.extraCount === 1 ? "sesión extra" : "sesiones extra"} esta
                  semana.
                </p>
              ) : null}
            </>
          )}
          {showStreak ? <StreakChip current={streak.current} longest={streak.longest} /> : null}
        </div>
      );
    }
  }
}

// El coach entrena como un alumno más (DC-22): desde aquí llega a su historial, progreso y medidas.
async function CoachTrainingLinks() {
  const user = await requireUser();
  if (user.role !== "coach") return null;
  return (
    <nav aria-label="Mi entrenamiento" className="flex flex-wrap gap-2">
      {[
        ["/history", "Mi historial"],
        ["/progress", "Mi progreso"],
        ["/body", "Mi cuerpo"],
      ].map(([href, label]) => (
        <Button key={href} variant="outline" render={<Link href={href} />}>
          {label}
        </Button>
      ))}
    </nav>
  );
}

export default function WeekPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Mi semana</h1>
        <Link
          href="/week/summary"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary"
        >
          Resumen semanal <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
      <Suspense fallback={null}>
        <CoachTrainingLinks />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
        <WeekContent />
      </Suspense>
    </div>
  );
}
