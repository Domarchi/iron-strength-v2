import { z } from "zod";
import {
  coachSessionResultSchema,
  type CoachSessionRequest,
  type CoachSessionResult,
} from "@/domain/coach-session-mutation";
import type { EditorDraft } from "./editor-draft";
export type LegacyOperation = "save" | "order" | "copy" | "layout" | "alternatives" | "add";
export const legacyFields = {
  save: "saveRequest",
  order: "orderRequest",
  copy: "copyRequest",
  layout: "layoutRequest",
  alternatives: "alternativeRequest",
  add: "additionRequest",
} as const;
const legacyReply = z
  .object({
    ok: z.literal(true),
    version: z.literal(1),
    id: z.uuid(),
    sessionId: z.uuid(),
    operation: z.enum(["save", "order", "copy", "layout", "alternatives", "add"]),
    revision: z.number().int().min(0).optional(),
    copyId: z.uuid().optional(),
  })
  .strict();
export function confirmedCoachResult(
  reply: unknown,
  request: CoachSessionRequest,
  sessionId: string,
): CoachSessionResult | null {
  const parsed =
    reply && typeof reply === "object" && "ok" in reply && reply.ok === true && "result" in reply
      ? coachSessionResultSchema.safeParse(reply.result)
      : null;
  if (!parsed?.success) return null;
  const result = parsed.data;
  return result.id === request.id &&
    result.sessionId === sessionId &&
    result.revision >= request.revision &&
    (request.operation === "duplicate"
      ? result.copyId === request.data.copyId &&
        result.copyKind === (request.data.rowId === null ? "session" : "exercise")
      : result.copyId === undefined)
    ? result
    : null;
}
export function confirmedLegacyResult(
  reply: unknown,
  draft: EditorDraft,
  operation: LegacyOperation,
  sessionId: string,
): boolean {
  const parsed = legacyReply.safeParse(reply),
    original = draft[legacyFields[operation]];
  return (
    !!original &&
    parsed.success &&
    parsed.data.id === original.id &&
    parsed.data.sessionId === sessionId &&
    parsed.data.operation === operation &&
    (operation === "copy"
      ? parsed.data.copyId === original.id && parsed.data.revision === undefined
      : parsed.data.revision !== undefined &&
        parsed.data.revision >= ("revision" in original ? original.revision : 0) &&
        parsed.data.copyId === undefined)
  );
}
export function legacyEditorOperations(draft: EditorDraft): LegacyOperation[] {
  return (Object.keys(legacyFields) as LegacyOperation[]).filter(
    (operation) => !!draft[legacyFields[operation]],
  );
}
