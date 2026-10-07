import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatKg } from "@/domain/format";
import { requireUser } from "@/lib/auth/session";
import { ConstancyStrip } from "@/components/streak/constancy-strip";
import { santiagoDate } from "@/domain/dates";
import { listExerciseProgress } from "@/lib/data/progress";
import { getStreakSummary } from "@/lib/data/streak";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Progreso · Iron Strength" };

const shortDate = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

async function ExerciseList() {
  const user = await requireUser();
  const db = await createClient();
  const [list, streak] = await Promise.all([
    listExerciseProgress(db, user.id),
    getStreakSummary(db, user.id, santiagoDate(new Date())),
  ]);

  if (list.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-1 pt-6">
          <p className="font-medium">Aquí verás tu progreso.</p>
          <p className="text-sm text-muted-foreground">
            Cuando termines tu primer entrenamiento aparecerán tus ejercicios, tus mejores marcas y
            su evolución.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <ConstancyStrip {...streak} />
      <ul className="divide-y rounded-lg border">
        {list.map((e) => (
          <li key={e.exerciseId}>
            <Link
              href={`/progress/${e.exerciseId}`}
              className="flex min-h-16 flex-col justify-center gap-0.5 p-3 hover:bg-muted/50"
            >
              <span className="font-medium">{e.name}</span>
              <span className="text-sm text-muted-foreground">
                {e.isBodyweight
                  ? `Mejor serie: ${e.bestReps} repeticiones`
                  : `Mejor peso ${formatKg(e.bestWeightKg)} · 1RM estimado ${formatKg(Math.round(e.bestEstimated1RM * 10) / 10)}`}
              </span>
              <span className="text-xs text-muted-foreground">
                {e.workoutCount} {e.workoutCount === 1 ? "entrenamiento" : "entrenamientos"} ·
                último {shortDate.format(new Date(`${e.lastDate}T00:00:00Z`))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function ProgressPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Progreso</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
        <ExerciseList />
      </Suspense>
    </div>
  );
}
