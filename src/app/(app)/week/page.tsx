import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { santiagoDate } from "@/domain/dates";
import { PageHeading } from "@/components/layout/page-heading";
import { WeekOverview } from "@/components/week/week-overview";
import { PendingWorkouts } from "@/components/week/pending-workouts";
import { getStreakSummary } from "@/lib/data/streak";
import { getWeekView } from "@/lib/data/week";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Mi semana · Iron Strength" };

const day = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", timeZone: "UTC" });
const fmt = (date: string) => day.format(new Date(`${date}T00:00:00Z`));

async function WeekContent() {
  const user = await requireUser();
  const db = await createClient();
  const today = santiagoDate(new Date());
  const [view, streak] = await Promise.all([
    getWeekView(db, user.id, today),
    getStreakSummary(db, user.id, today),
  ]);

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
      return <WeekOverview view={view} today={today} streak={streak} />;
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

async function RecoveryLinks() {
  const user = await requireUser();
  return <PendingWorkouts userId={user.id} />;
}

export default function WeekPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Mi semana"
        eyebrow="Tu entrenamiento"
        description="Haz espacio para ti. Tu próxima sesión te espera."
        action={
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-card px-4 text-sm font-medium text-primary hover:bg-muted"
            href="/week/summary"
            aria-label="Resumen semanal"
          >
            <span className="sm:hidden">Resumen</span>
            <span className="hidden sm:inline">Resumen semanal</span>{" "}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        }
      />
      <Suspense fallback={null}>
        <RecoveryLinks />
      </Suspense>
      <Suspense fallback={null}>
        <CoachTrainingLinks />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
        <WeekContent />
      </Suspense>
    </div>
  );
}
