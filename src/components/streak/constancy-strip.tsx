import { Flame } from "lucide-react";
import type { ConstancyWeek } from "@/domain/constancy";
import { cn } from "@/lib/utils";

const OUTCOME_LABEL: Record<ConstancyWeek["outcome"], string> = {
  complete: "completa",
  missed: "incompleta",
  in_progress: "en curso",
  neutral: "descarga",
  none: "sin programa",
};

const SQUARE: Record<ConstancyWeek["outcome"], string> = {
  complete: "bg-primary border-primary",
  missed: "bg-destructive/15 border-destructive/50",
  in_progress: "border-primary border-dashed bg-primary/10",
  neutral: "bg-muted border-border",
  none: "border-transparent bg-muted/40",
};

const dateFormat = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

// Racha en semanas y calendario de constancia de las últimas semanas (RF-29).
export function ConstancyStrip({
  current,
  longest,
  calendar,
}: {
  current: number;
  longest: number;
  calendar: ConstancyWeek[];
}) {
  const weeks = (n: number) => `${n} ${n === 1 ? "semana" : "semanas"}`;

  return (
    <section aria-label="Racha y constancia" className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Flame
          className={cn("size-5", current > 0 ? "text-primary" : "text-muted-foreground")}
          aria-hidden
        />
        <p className="font-medium">
          {current > 0 ? `Racha: ${weeks(current)}` : "Aún sin racha"}
          {longest > current ? (
            <span className="font-normal text-muted-foreground"> · mejor: {weeks(longest)}</span>
          ) : null}
        </p>
      </div>
      {current === 0 ? (
        <p className="text-xs text-muted-foreground">
          Completa todas las sesiones de una semana para empezar tu racha.
        </p>
      ) : null}
      <ol className="flex gap-1" aria-label="Últimas semanas, de la más antigua a la actual">
        {calendar.map((week) => (
          <li
            key={week.weekStart}
            title={`Semana del ${dateFormat.format(new Date(`${week.weekStart}T00:00:00Z`))}: ${OUTCOME_LABEL[week.outcome]}`}
            className={cn(
              "h-6 flex-1 rounded-sm border",
              SQUARE[week.outcome],
              week.current && "ring-2 ring-ring/60",
            )}
          >
            <span className="sr-only">
              Semana del {dateFormat.format(new Date(`${week.weekStart}T00:00:00Z`))}:{" "}
              {OUTCOME_LABEL[week.outcome]}
              {week.planned ? `, ${week.done ?? 0} de ${week.planned} sesiones` : ""}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        Cada cuadro es una semana. Lleno = completaste todas tus sesiones.
      </p>
    </section>
  );
}
