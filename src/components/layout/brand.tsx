import { Dumbbell } from "lucide-react";

export function Brand() {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Dumbbell className="size-6" aria-hidden />
      </span>
      <span>
        <span className="block text-sm font-bold tracking-[0.08em]">IRON STRENGTH</span>
        <span className="mt-0.5 hidden text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase sm:block">
          Un entrenamiento a la vez
        </span>
      </span>
    </span>
  );
}
