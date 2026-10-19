import { Check } from "lucide-react";
import type { StripDay } from "@/domain/week-strip";
import { cn } from "@/lib/utils";

const weekday = new Intl.DateTimeFormat("es-CL", { weekday: "long", timeZone: "UTC" });

function describe(day: StripDay): string {
  const name = weekday.format(new Date(`${day.date}T00:00:00Z`));
  const state = day.trained
    ? "entrenaste"
    : day.isToday
      ? "hoy"
      : day.isFuture
        ? ""
        : "sin entreno";
  return [`${name} ${day.dayNumber}`, day.isToday && day.trained ? "hoy" : "", state]
    .filter(Boolean)
    .join(", ");
}

// Lunes a domingo (RF-61): el día de hoy con anillo y los días entrenados rellenos.
export function WeekStrip({ days }: { days: StripDay[] }) {
  return (
    <ol aria-label="Días de la semana" className="grid grid-cols-7 gap-1 sm:gap-3">
      {days.map((day) => (
        <li
          key={day.date}
          className="flex flex-col items-center gap-1"
          aria-current={day.isToday ? "date" : undefined}
        >
          <span className="sr-only">{describe(day)}</span>
          <span
            aria-hidden
            className={cn(
              "text-xs font-medium",
              day.isToday ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {day.label}
          </span>
          <span
            aria-hidden
            className={cn(
              "grid size-10 place-items-center rounded-xl border text-sm font-semibold tabular-nums",
              day.trained
                ? "border-primary bg-primary text-primary-foreground"
                : "border-transparent bg-muted/60 text-muted-foreground",
              day.isToday && !day.trained && "border-2 border-primary bg-primary/5 text-foreground",
              day.isToday &&
                day.trained &&
                "ring-2 ring-primary ring-offset-2 ring-offset-background",
              day.isFuture && !day.trained && "border-dashed",
            )}
          >
            {day.trained ? <Check className="size-5" /> : day.dayNumber}
          </span>
        </li>
      ))}
    </ol>
  );
}
