import { z } from "zod";
export const restSchema = z.union([z.literal(0), z.number().int().min(15).max(600)]).nullable();
export const layoutRowSchema = z.object({
  id: z.uuid(),
  restSeconds: restSchema,
  supersetId: z.uuid().nullable(),
  supersetRestSeconds: restSchema,
});
export type LayoutRow = z.infer<typeof layoutRowSchema>;
export type LayoutRequest = { id: string; revision: number; layout: LayoutRow[] };
export function sessionLayout(
  rows: {
    id: string;
    restSeconds?: number | null;
    supersetId?: string | null;
    supersetRestSeconds?: number | null;
  }[],
): LayoutRow[] {
  return rows.map((r) => ({
    id: r.id,
    restSeconds: r.restSeconds ?? null,
    supersetId: r.supersetId ?? null,
    supersetRestSeconds: r.supersetRestSeconds ?? null,
  }));
}
export function groupSelected(
  rows: LayoutRow[],
  ids: string[],
  groupId: string,
): LayoutRow[] | null {
  const indices = rows.flatMap((r, i) => (ids.includes(r.id) ? [i] : []));
  if (
    ids.length < 2 ||
    ids.length > 4 ||
    new Set(ids).size !== ids.length ||
    indices.length !== ids.length ||
    indices.at(-1)! - indices[0] + 1 !== ids.length ||
    indices.some((i) => rows[i].supersetId)
  )
    return null;
  return rows.map((r) =>
    ids.includes(r.id) ? { ...r, supersetId: groupId, supersetRestSeconds: null } : r,
  );
}
export function separateGroup(rows: LayoutRow[], groupId: string): LayoutRow[] {
  return rows.map((r) =>
    r.supersetId === groupId ? { ...r, supersetId: null, supersetRestSeconds: null } : r,
  );
}
export function separateMember(rows: LayoutRow[], id: string): LayoutRow[] {
  const member = rows.find((r) => r.id === id);
  if (!member?.supersetId) return rows;
  const group = rows.filter((r) => r.supersetId === member.supersetId);
  if (group.length <= 2) return separateGroup(rows, member.supersetId);
  const next = rows.filter((r) => r.id !== id);
  const last = next.findLastIndex((r) => r.supersetId === member.supersetId);
  next.splice(last + 1, 0, { ...member, supersetId: null, supersetRestSeconds: null });
  return next;
}
