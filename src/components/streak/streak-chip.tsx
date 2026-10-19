import Link from "next/link";
import { ChevronRight, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

// Racha en una línea (RF-63): el detalle y el calendario de constancia están en Progreso.
export function StreakChip({ current, longest }: { current: number; longest: number }) {
  const weeks = (n: number) => `${n} ${n === 1 ? "semana" : "semanas"}`;
  return (
    <Link
      href="/progress"
      className="flex min-h-12 items-center gap-2 border-t py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Flame
        className={cn("size-5 shrink-0", current > 0 ? "text-primary" : "text-muted-foreground")}
        aria-hidden
      />
      <span className="flex-1 font-medium">
        {current > 0 ? `Racha: ${weeks(current)}` : "Aún sin racha"}
        {longest > current ? (
          <span className="font-normal text-muted-foreground"> · mejor: {weeks(longest)}</span>
        ) : null}
      </span>
      <span className="text-xs text-muted-foreground">Ver progreso</span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}
