import { Dumbbell } from "lucide-react";

export function Brand() {
  return (
    <span className="inline-flex min-h-11 items-center gap-2.5">
      <Dumbbell className="brand-icon size-7 shrink-0 text-primary" aria-hidden />
      <span className="text-base font-bold tracking-tight">IRON STRENGTH</span>
    </span>
  );
}
