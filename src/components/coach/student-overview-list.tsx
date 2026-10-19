import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { UnreadBadge } from "@/components/unread/unread-badge";
import type { StudentOverview } from "@/lib/data/students";
import { cn } from "@/lib/utils";

const day = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const shortDay = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  timeZone: "America/Santiago",
});

function weekText(week: StudentOverview["week"]): string {
  switch (week.kind) {
    case "no_program":
      return "Sin programa asignado";
    case "scheduled":
      return `${week.programName}: aún no empieza`;
    case "finished":
      return `${week.programName}: terminado`;
    case "active":
      return week.deload
        ? `${week.programName} · semana ${week.weekNumber}: descarga`
        : `${week.programName} · semana ${week.weekNumber}: ${week.done} de ${week.planned} sesiones`;
  }
}

export function StudentOverviewList({
  overviews,
  unreadByStudent,
}: {
  overviews: StudentOverview[];
  unreadByStudent?: Map<string, number>;
}) {
  if (overviews.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no tienes alumnos. Invita al primero con el formulario de abajo.
      </p>
    );
  }

  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {overviews.map((student) => {
        const ratio =
          student.week.kind === "active" && student.week.planned > 0
            ? student.week.done / student.week.planned
            : null;
        return (
          <li
            key={student.id}
            className="overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/40"
          >
            <Link
              href={`/coach/students/${student.id}`}
              className="flex min-h-32 items-start justify-between gap-3 p-4"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  <span
                    aria-hidden
                    className="mr-1 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                  >
                    {student.fullName
                      .trim()
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")}
                  </span>
                  <span className="truncate">{student.fullName}</span>
                  <UnreadBadge count={unreadByStudent?.get(student.id) ?? 0} />
                  {!student.isActive ? (
                    <span className="rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                      Desactivado
                    </span>
                  ) : null}
                </span>
                <span className="text-sm text-muted-foreground">
                  {student.lastWorkoutDate
                    ? `Último entreno: ${day.format(new Date(`${student.lastWorkoutDate}T00:00:00Z`))}`
                    : "Sin entrenamientos todavía"}
                </span>
                <span className="text-sm text-muted-foreground">{weekText(student.week)}</span>
                {ratio !== null ? (
                  <span
                    role="progressbar"
                    aria-label="Cumplimiento de la semana"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(ratio * 100)}
                    className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <span
                      className={cn("block h-full bg-primary")}
                      style={{ width: `${Math.round(ratio * 100)}%` }}
                    />
                  </span>
                ) : null}
                {student.lastCommentAt ? (
                  <span className="text-xs text-muted-foreground">
                    Último comentario: {shortDay.format(new Date(student.lastCommentAt))}
                  </span>
                ) : null}
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
