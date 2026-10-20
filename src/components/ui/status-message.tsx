import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
export function StatusMessage({
  children,
  error = false,
  className,
}: {
  children: ReactNode;
  error?: boolean;
  className?: string;
}) {
  return (
    <p
      role={error ? "alert" : "status"}
      data-slot="status-message"
      className={cn(
        "rounded-md border px-3 py-2 text-sm wrap-anywhere",
        error
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-border bg-muted/40 text-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}
