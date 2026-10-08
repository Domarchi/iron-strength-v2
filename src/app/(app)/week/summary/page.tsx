import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { santiagoDate } from "@/domain/dates";
import { formatKg, formatTrend } from "@/domain/format";
import { requireUser } from "@/lib/auth/session";
import { getWeeklySummary, type WeekCard } from "@/lib/data/weekly-summary";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Resumen semanal · Iron Strength" };

const day = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", timeZone: "UTC" });
const fmt = (date: string) => day.format(new Date(`${date}T00:00:00Z`));

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function WeekSection({ week }: { week: WeekCard }) {
  const title = week.isCurrent ? "Esta semana" : "Semana anterior";
  const hasVolume = week.volumeKg > 0;
  const headingId = week.isCurrent ? "current-week" : "previous-week";

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div>
        <h2 id={headingId} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">
          Del {fmt(week.weekStart)} al {fmt(week.weekEnd)}
          {week.isCurrent ? " · parcial, aún no termina" : ""}
        </p>
      </div>

      {week.workoutCount === 0 ? (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground">
          {week.isCurrent
            ? "Todavía no registras entrenamientos esta semana."
            : "No registraste entrenamientos esa semana."}
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3">
        <Stat
          label="Sesiones del programa"
          value={week.sessions ? `${week.sessions.done} de ${week.sessions.planned}` : "—"}
          note={week.sessions ? undefined : "Sin sesiones planificadas"}
        />
        <Stat
          label="Entrenamientos"
          value={String(week.workoutCount)}
          note={
            week.trainedDays > 0
              ? `${week.trainedDays} ${week.trainedDays === 1 ? "día" : "días"}`
              : undefined
          }
        />
        <Stat
          label="Récords"
          value={String(week.records)}
          note={week.records > 0 ? "¡Buen trabajo!" : undefined}
        />
        <Stat
          label="Volumen"
          value={hasVolume ? formatKg(week.volumeKg) : "—"}
          note={hasVolume || week.volumeTrend !== null ? formatTrend(week.volumeTrend) : undefined}
        />
      </dl>
      {week.bodyweightReps > 0 ? (
        <p className="text-sm text-muted-foreground">
          Además, {week.bodyweightReps} repeticiones con tu peso corporal.
        </p>
      ) : null}
    </section>
  );
}

async function SummaryContent() {
  const user = await requireUser();
  const summary = await getWeeklySummary(await createClient(), user.id, santiagoDate(new Date()));
  return (
    <>
      <WeekSection week={summary.current} />
      <WeekSection week={summary.previous} />
    </>
  );
}

export default function WeeklySummaryPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/week" className="inline-flex min-h-11 items-center gap-1 text-sm text-primary">
          <ChevronLeft className="size-4" aria-hidden /> Mi semana
        </Link>
        <h1 className="text-xl font-semibold">Resumen semanal</h1>
      </header>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
        <SummaryContent />
      </Suspense>
    </div>
  );
}
