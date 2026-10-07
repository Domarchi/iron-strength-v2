import * as React from "react";
import { cn } from "@/lib/utils";

// Select nativo con el estilo de Input: en móvil abre el selector del sistema (mejor que un menú propio).
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30 [&>option]:bg-background",
        className,
      )}
      {...props}
    />
  );
}
