import { PendingWorkoutChanges } from "@/components/workout-changes/pending";
import { workoutTitle } from "@/domain/workout-title";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeading } from "@/components/layout/page-heading";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { capitalizeFirst, formatDuration, formatKg } from "@/domain/format";
import { UnreadBadge } from "@/components/unread/unread-badge";
import { requireUser } from "@/lib/auth/session";
import { getUnreadSummary } from "@/lib/data/unread";
import { listWorkouts } from "@/lib/data/workouts";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Historial · Iron Strength" };

const dayFormat = new Intl.DateTimeFormat("es-CL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

async function WorkoutList({ cursor }: { cursor?: string }) {
  const user = await requireUser();
  const db = await createClient();
  const [{ items, nextCursor }, unread] = await Promise.all([
    listWorkouts(db, user.id, { limit: 20, cursor }),
    getUnreadSummary(db).catch(() => null),
  ]);

  if (items.length === 0 && !cursor) {
    return (
      <EmptyState title="Todavía no registraste ningún entrenamiento.">
        Cuando termines el primero, aparecerá aquí.
      </EmptyState>
    );
  }

  return (
    <>
      <ul className="flow-list divide-y divide-border/70 overflow-hidden rounded-lg border bg-card">
        {items.map((w) => (
          <li key={w.id}>
            <Link
              href={`/history/${w.id}`}
              className="flex min-h-16 flex-col justify-center gap-0.5 p-3 hover:bg-muted/50"
            >
              <span className="flex items-center gap-2 font-medium">
                {capitalizeFirst(dayFormat.format(new Date(`${w.performedOn}T00:00:00Z`)))}
                <UnreadBadge count={unread?.byWorkout.get(w.id) ?? 0} />
              </span>
              <span className="text-sm text-muted-foreground">
                {workoutTitle(w)} · {w.workingSets} series · {formatDuration(w.durationSeconds)}
                {w.volumeKg > 0 ? ` · ${formatKg(w.volumeKg)}` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {nextCursor ? (
        <div>
          <Button
            variant="outline"
            render={<Link href={`/history?antes=${encodeURIComponent(nextCursor)}`} />}
          >
            Ver anteriores
          </Button>
        </div>
      ) : null}
    </>
  );
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ antes?: string }>;
}) {
  const { antes } = await searchParams;
  return (
    <div className="flow-page flex flex-col gap-4">
      <PageHeading
        title="Historial"
        eyebrow="Tu recorrido"
        description="Tus entrenamientos guardados."
      />
      <PendingWorkoutChanges />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
        <WorkoutList cursor={antes} />
      </Suspense>
    </div>
  );
}
