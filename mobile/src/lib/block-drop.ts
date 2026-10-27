export type DropRect = Readonly<{ x: number; y: number; width: number; height: number }>;
export type DropPoint = Readonly<{ x: number; y: number }>;
export type DropRow = Readonly<{ id: string; y: number; height: number }>;
function inside(view: DropRect, point: DropPoint) {
  return (
    [view.x, view.y, view.width, view.height, point.x, point.y].every(Number.isFinite) &&
    view.width > 0 &&
    view.height > 0 &&
    point.x >= view.x &&
    point.x <= view.x + view.width &&
    point.y >= view.y &&
    point.y <= view.y + view.height
  );
}
export function blockDropTarget(
  rows: readonly DropRow[],
  view: DropRect,
  offset: number,
  point: DropPoint,
): string | null {
  if (!inside(view, point) || !Number.isFinite(offset) || offset < 0) return null;
  const y = point.y - view.y + offset;
  return (
    rows.find(
      (r) =>
        Number.isFinite(r.y) &&
        Number.isFinite(r.height) &&
        r.height > 0 &&
        y >= r.y &&
        y <= r.y + r.height,
    )?.id ?? null
  );
}
/** A small bounded step, called only during an active drag. */
export function scrollDragDelta(
  view: DropRect,
  point: DropPoint,
  offset: number,
  contentHeight: number,
): number {
  if (!inside(view, point) || !Number.isFinite(offset) || !Number.isFinite(contentHeight)) return 0;
  const max = Math.max(0, contentHeight - view.height);
  if (point.y < view.y + 36 && offset > 0) return -Math.min(12, offset);
  if (point.y > view.y + view.height - 36) return Math.min(12, Math.max(0, max - offset));
  return 0;
}
