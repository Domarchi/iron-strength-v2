import type { ReactNode } from "react";
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      data-slot="empty-state"
      className="rounded-xl border border-dashed bg-card p-5 space-y-2 wrap-anywhere"
    >
      <p className="font-medium text-foreground">{title}</p>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
