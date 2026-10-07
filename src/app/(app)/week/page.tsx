import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { santiagoDate } from "@/domain/dates";
import { ConstancyStrip } from "@/components/streak/constancy-strip";
import { getStreakSummary } from "@/lib/data/streak";
import { getWeekView, type WeekSession } from "@/lib/data/week";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Mi semana · Iron Strength" };

const day = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", timeZone: "UTC" });
const fmt = (date: string) => day.format(new Date(`${date}T00:00:00Z`));

function SessionCard({ session }: { session: WeekSession }) {
  const done = session.status === "done";
  return (
    <li>
      <Card className={done ? "border-primary/40" : undefined}>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {done ? (
              <CheckCircle2 className="size-6 text-primary" aria-hidden />
            ) : (
              <Circle className="size-6 text-muted-foreground" aria-hidden />
            )}
            <div>
              <CardTitle className="text-base">Sesión {session.label}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {session.exerciseCount} {session.exerciseCount === 1 ? "ejercicio" : "ejercicios"} ·{" "}
                {done ? "Hecha" : "Pendiente"}
              </p>
            </div>
          </div>
          {done ? (
            <Button variant="outline" render={<Link href={`/history/${session.workoutId}`} />}>
              Ver
            </Button>
          ) : (
            <Button render={<Link href={`/workout/${session.sessionId}`} />}>Empezar</Button>
          )}
        </CardHeader>
        {done ? (
          <CardContent>
            <Link
              href={`/workout/${session.sessionId}`}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Repetir esta sesión (cuenta como extra)
            </Link>
          </CardContent>
        ) : null}
      </Card>
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

    case "active":
      return (
        <div className="flex flex-col gap-4">
          {showStreak ? <ConstancyStrip {...streak} /> : null}
          <div>
            <p className="text-sm text-muted-foreground">
              {view.program.name} · semana {view.weekNumber} de {view.program.weeksCount}
            </p>
            <p className="text-sm text-muted-foreground">
              Del {fmt(view.weekStart)} al {fmt(view.weekEnd)}
            </p>
          </div>

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
              <ul className="flex flex-col gap-3">
                {view.sessions.map((session) => (
                  <SessionCard key={session.sessionId} session={session} />
                ))}
              </ul>
              {view.extraCount > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {view.extraCount} {view.extraCount === 1 ? "sesión extra" : "sesiones extra"} esta
                  semana.
                </p>
              ) : null}
            </>
          )}
        </div>
      );
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
      <h1 className="text-xl font-semibold">Mi semana</h1>
      <Suspense fallback={null}>
        <CoachTrainingLinks />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
        <WeekContent />
      </Suspense>
    </div>
  );
}
