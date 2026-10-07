import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { santiagoDate } from "@/domain/dates";
import { listStudentOverviews, type StudentOverview } from "@/lib/data/students";
import { createClient } from "@/lib/supabase/server";
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

export async function StudentsList() {
  const overviews = await listStudentOverviews(await createClient(), santiagoDate(new Date()));

  if (overviews.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no tienes alumnos. Invita al primero con el formulario de abajo.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {overviews.map((student) => {
        const ratio =
          student.week.kind === "active" && student.week.planned > 0
            ? student.week.done / student.week.planned
            : null;
        return (
          <li key={student.id}>
            <Link
              href={`/coach/students/${student.id}`}
              className="flex min-h-20 items-center justify-between gap-3 p-3 hover:bg-muted/50"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center gap-2 font-medium">
                  <span className="truncate">{student.fullName}</span>
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
                    className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-muted"
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
