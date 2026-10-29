"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { coachSessionRequestSchema } from "@/domain/coach-session-mutation";
import { mutateCoachSession, type CoachSessionMutationResult } from "@/lib/data/coach-session";
import { getCoachProgramTree } from "@/lib/data/coach-programs";
import { decodeCoachEditorDraft } from "@/lib/coach/typed-editor-draft";
import {
  saveSessionPrescriptions,
  reorderSessionExercises,
  duplicateRoutineItem,
} from "@/lib/data/programs";
import { configureSessionLayout } from "@/lib/data/session-layout";
import { configureAlternatives } from "@/lib/data/routine-alternatives";
import { addRoutineExercises } from "@/lib/data/routine-additions";

const scopeSchema = z
  .object({ userId: z.uuid(), programId: z.uuid(), sessionId: z.uuid() })
  .strict();
const mutationSchema = scopeSchema.extend({ request: coachSessionRequestSchema }).strict();
const legacySchema = scopeSchema
  .extend({
    raw: z.string().max(262144),
    operation: z.enum(["save", "order", "copy", "layout", "alternatives", "add"]),
  })
  .strict();
export type LegacySessionResult =
  | {
      ok: true;
      version: 1;
      id: string;
      sessionId: string;
      operation: "save" | "order" | "copy" | "layout" | "alternatives" | "add";
      revision?: number;
      copyId?: string;
    }
  | {
      ok: false;
      reason:
        | "invalid"
        | "conflict"
        | "week_locked"
        | "not_found"
        | "forbidden"
        | "unauthenticated"
        | "uncertain"
        | "limit";
    };
function refresh(programId: string) {
  revalidatePath(`/coach/programs/${programId}`);
  revalidatePath("/coach/programs");
}

/** Reconciliation reaches the receipt before attempting any read of the possibly removed source. */
export async function mutateCanonicalSessionAction(
  input: unknown,
): Promise<CoachSessionMutationResult> {
  const user = await requireCoach(),
    parsed = mutationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  if (parsed.data.userId !== user.id) return { ok: false, reason: "forbidden" };
  try {
    const result = await mutateCoachSession(
      await createClient(),
      parsed.data.sessionId,
      parsed.data.request,
    );
    if (result.ok) refresh(parsed.data.programId);
    return result;
  } catch {
    return { ok: false, reason: "uncertain" };
  }
}
export async function reviewCanonicalSessionAction(input: unknown) {
  const user = await requireCoach(),
    scope = scopeSchema.safeParse(input);
  if (!scope.success || scope.data.userId !== user.id) return null;
  const tree = await getCoachProgramTree(await createClient(), scope.data.programId);
  if (!tree || tree.coachId !== user.id) return null;
  return tree.sessions.find((session) => session.id === scope.data.sessionId) ?? null;
}
/** Original contracts/functions only. Never generate an ID or refresh an old expected revision. */
export async function reconcileLegacySessionAction(input: unknown): Promise<LegacySessionResult> {
  const user = await requireCoach(),
    parsed = legacySchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const scope = parsed.data;
  if (scope.userId !== user.id) return { ok: false, reason: "forbidden" };
  const entry = decodeCoachEditorDraft(scope.raw, scope);
  if (entry.kind !== "legacy") return { ok: false, reason: "invalid" };
  const draft = entry.draft,
    operation = scope.operation;
  const exists = {
    save: draft.saveRequest,
    order: draft.orderRequest && draft.order,
    copy: draft.copyRequest,
    layout: draft.layoutRequest,
    alternatives: draft.alternativeRequest,
    add: draft.additionRequest,
  };
  if (!exists[operation]) return { ok: false, reason: "invalid" };
  try {
    const db = await createClient();
    if (operation === "copy") {
      const request = draft.copyRequest!;
      if (!z.uuid().safeParse(request.id).success) return { ok: false, reason: "invalid" };
      const result = await duplicateRoutineItem({
        db,
        sessionId: scope.sessionId,
        copyId: request.id,
        ...(request.exerciseId ? { exerciseId: request.exerciseId } : {}),
      });
      if (!result.ok) return result;
      if (result.id !== request.id) return { ok: false, reason: "uncertain" };
      refresh(scope.programId);
      return {
        ok: true,
        version: 1,
        id: request.id,
        sessionId: scope.sessionId,
        operation,
        copyId: result.id,
      };
    }
    const result =
      operation === "save"
        ? await saveSessionPrescriptions({
            db,
            sessionId: scope.sessionId,
            rows: draft.saveRequest!.rows,
            requestId: draft.saveRequest!.id,
            expectedRevision: draft.saveRequest!.revision,
            ...(draft.saveRequest!.title !== undefined ? { title: draft.saveRequest!.title } : {}),
            ...(draft.saveRequest!.weekday !== undefined
              ? { weekday: draft.saveRequest!.weekday }
              : {}),
          })
        : operation === "order"
          ? await reorderSessionExercises({
              db,
              sessionId: scope.sessionId,
              orderedIds: draft.order!,
              requestId: draft.orderRequest!.id,
              expectedRevision: draft.orderRequest!.revision,
            })
          : operation === "layout"
            ? await configureSessionLayout(db, scope.sessionId, draft.layoutRequest!)
            : operation === "alternatives"
              ? await configureAlternatives(db, scope.sessionId, draft.alternativeRequest!)
              : await addRoutineExercises(db, scope.sessionId, draft.additionRequest!);
    if (!result.ok) return result;
    if (!z.number().int().min(0).max(2147483647).safeParse(result.revision).success)
      return { ok: false, reason: "uncertain" };
    const original =
      operation === "save"
        ? draft.saveRequest!
        : operation === "order"
          ? draft.orderRequest!
          : operation === "layout"
            ? draft.layoutRequest!
            : operation === "alternatives"
              ? draft.alternativeRequest!
              : draft.additionRequest!;
    refresh(scope.programId);
    return {
      ok: true,
      version: 1,
      id: original.id,
      sessionId: scope.sessionId,
      operation,
      revision: result.revision,
    };
  } catch {
    return { ok: false, reason: "uncertain" };
  }
}
