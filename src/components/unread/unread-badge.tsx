import { unreadLabel } from "@/domain/unread";

// Marca "N sin leer" (RF-37) para filas de listas.
export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
      {unreadLabel(count)}
    </span>
  );
}
