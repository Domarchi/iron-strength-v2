import * as React from "react";
import { cn } from "@/lib/utils";

// Select nativo con el estilo de Input: en móvil abre el selector del sistema (mejor que un menú propio).
export function NativeSelect({ className, style, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-11 w-full min-w-0 appearance-none rounded-md border border-input bg-card py-1 pr-9 pl-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30 [&>option]:bg-background",
        className,
      )}
      style={{
        backgroundImage:
          "linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%)",
        backgroundPosition: "calc(100% - 17px) 50%, calc(100% - 12px) 50%",
        backgroundSize: "5px 5px",
        backgroundRepeat: "no-repeat",
        ...style,
      }}
      {...props}
    />
  );
}
