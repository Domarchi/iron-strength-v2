import { z } from "zod";
import { coachSessionRequestSchema } from "@/domain/coach-session-mutation";
import { prescriptionInputSchema, type PrescriptionInput } from "@/domain/prescription-input";
import { legacyEditorDraftSchema, type EditorDraft } from "./editor-draft";
import {
  buildCoachBulkPreview,
  coachBulkFieldsSchema,
  coachRowEditSchema,
  type CoachRowEdit,
} from "./typed-prescription";
import type { CoachCatalogExercise, CoachSessionRow } from "@/lib/data/coach-programs";
import type { PrescriptionDraft } from "./routine-editor";

type Scope = { userId: string; programId: string; sessionId: string };
const ids = z
  .array(z.uuid())
  .max(15)
  .refine((values) => new Set(values.map((v) => v.toLowerCase())).size === values.length);
const alternative = z.object({ exerciseId: z.uuid(), input: prescriptionInputSchema }).strict();
const bulk = z
  .object({ ids: ids.refine((values) => values.length > 0), fields: coachBulkFieldsSchema })
  .strict();
const sameScope = (left: Scope, right: Scope) =>
  left.userId === right.userId &&
  left.programId === right.programId &&
  left.sessionId === right.sessionId;
function canonical(value: unknown): string {
  const sort = (entry: unknown): unknown =>
    Array.isArray(entry)
      ? entry.map(sort)
      : entry && typeof entry === "object"
        ? Object.fromEntries(
            Object.entries(entry)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, sort(item)]),
          )
        : entry;
  return JSON.stringify(sort(value));
}
function readLegacy(raw: string): EditorDraft | null {
  try {
    const original: unknown = JSON.parse(raw),
      parsed = legacyEditorDraftSchema.safeParse(original);
    // The historical parser strips nested unknown fields. Recovery must preserve them instead.
    return parsed.success && canonical(original) === canonical(parsed.data) ? parsed.data : null;
  } catch {
    return null;
  }
}
function hasLegacyRequest(draft: EditorDraft): boolean {
  return !!(
    draft.saveRequest ||
    draft.orderRequest ||
    draft.copyRequest ||
    draft.layoutRequest ||
    draft.alternativeRequest ||
    draft.additionRequest
  );
}
export const coachEditorDraftSchema = z
  .object({
    version: z.literal(4),
    id: z.uuid(),
    userId: z.uuid(),
    programId: z.uuid(),
    sessionId: z.uuid(),
    revision: z.number().int().min(0).max(2147483647),
    updatedAt: z.iso.datetime(),
    edits: z.record(z.uuid(), coachRowEditSchema),
    title: z.string().optional(),
    weekday: z.number().int().min(-1).max(6).optional(),
    selection: ids,
    additionSelection: ids,
    bulk: bulk.nullable(),
    alternatives: z.record(
      z.uuid(),
      z
        .array(alternative)
        .max(3)
        .refine(
          (rows) => new Set(rows.map((row) => row.exerciseId.toLowerCase())).size === rows.length,
        ),
    ),
    order: ids.nullable(),
    pending: coachSessionRequestSchema.nullable(),
    previousRaw: z.string().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      Object.values(value).some((v) => v === undefined) ||
      Object.entries(value.edits).some(([key, edit]) => key !== edit.id) ||
      (value.pending && value.pending.revision !== value.revision)
    )
      context.addIssue({
        code: "custom",
        message: "El borrador no corresponde a su revisión o sus filas.",
      });
    if (value.previousRaw !== null) {
      const previous = readLegacy(value.previousRaw);
      if (
        !previous ||
        previous.id !== value.id ||
        !sameScope(previous, value) ||
        hasLegacyRequest(previous)
      )
        context.addIssue({
          code: "custom",
          message: "El formato anterior no corresponde a este borrador.",
        });
    }
  });
export type CoachEditorDraft = z.infer<typeof coachEditorDraftSchema>;
type LegacyEntry = { kind: "legacy"; raw: string; draft: EditorDraft };
export type CoachEditorEntry =
  | { kind: "empty" }
  | { kind: "unknown"; raw: string }
  | LegacyEntry
  | { kind: "current"; raw: string; draft: CoachEditorDraft };
/** Unknown/future/foreign documents remain opaque and cannot be overwritten as an empty draft. */
export function decodeCoachEditorDraft(raw: string | null, scope: Scope): CoachEditorEntry {
  if (raw === null) return { kind: "empty" };
  try {
    const current = coachEditorDraftSchema.safeParse(JSON.parse(raw));
    if (current.success && sameScope(current.data, scope))
      return { kind: "current", raw, draft: current.data };
    const previous = readLegacy(raw);
    if (previous && sameScope(previous, scope)) return { kind: "legacy", raw, draft: previous };
  } catch {
    /* Keep the exact bytes, including corrupt JSON. */
  }
  return { kind: "unknown", raw };
}
export function coachEditorDraftKey(value: Scope & { id: string }): string {
  for (const id of [value.userId, value.programId, value.sessionId, value.id]) z.uuid().parse(id);
  // Retain the existing account cleanup namespace; version is in the closed document.
  return `is:coach-draft:v1:${value.userId}:${value.programId}:${value.sessionId}:${value.id}`;
}
function legacyInput(
  row: Pick<PrescriptionDraft, "sets" | "repsMin" | "repsMax" | "targetWeightKg" | "series">,
): PrescriptionInput {
  const target = (value: { repsMin: string; repsMax: string; targetWeightKg: string }) => ({
    ...value,
    targetDurationSeconds: "",
    targetDistanceMeters: "",
  });
  if (row.series != null) {
    if (row.sets !== String(row.series.length)) throw Error("unrepresentable count");
    return { mode: "series", recordType: null, series: row.series.map(target) };
  }
  return {
    mode: "uniform",
    recordType: null,
    sets: row.sets,
    target: target({
      repsMin: row.repsMin,
      repsMax: row.repsMax,
      targetWeightKg: row.targetWeightKg,
    }),
  };
}
/** This does not write. A caller must commit the returned envelope with CAS and verified readback. */
export function migrateCoachEditorDraft(
  entry: LegacyEntry,
  source: CoachSessionRow,
  catalog: CoachCatalogExercise[],
):
  | { ok: true; draft: CoachEditorDraft }
  | { ok: false; reason: "pending" | "incompatible"; entry: LegacyEntry } {
  const old = entry.draft;
  if (hasLegacyRequest(old)) return { ok: false, reason: "pending", entry };
  try {
    if (source.id !== old.sessionId) throw Error("identity");
    const edits: Record<string, CoachRowEdit> = {};
    const goalKeys = ["sets", "repsMin", "repsMax", "targetWeightKg"] as const;
    for (const [key, row] of Object.entries(old.edits)) {
      const base = source.exercises.find(
        (item) => item.id === row.id && item.exerciseId === row.exerciseId,
      );
      if (key !== row.id || !base || base.prescribed.recordType !== null)
        throw Error("row changed");
      const edit: CoachRowEdit = { id: row.id, exerciseId: row.exerciseId };
      if (row.fields === undefined || row.fields.includes("series")) {
        if (row.fields?.includes("series") && row.series === undefined)
          throw Error("missing detail");
        edit.targets = { kind: "replace", input: legacyInput(row) };
      } else {
        const fields = Object.fromEntries(
          goalKeys
            .filter((field) => row.fields!.includes(field))
            .map((field) => [field, row[field]]),
        );
        if (Object.keys(fields).length) {
          const preview = buildCoachBulkPreview([base], { ids: [base.id], fields });
          if (!preview.ok) throw Error("incomplete selected field");
          edit.targets = { kind: "patch", changes: preview.rows[0].changes };
        }
      }
      if (row.fields === undefined || row.fields.includes("note")) edit.note = row.note;
      for (const field of ["restSeconds", "supersetRestSeconds"] as const) {
        if (row.fields?.includes(field) && row[field] === undefined) throw Error("missing rest");
        if (row.fields === undefined ? row[field] !== undefined : row.fields.includes(field))
          edit[field] = row[field];
      }
      edits[key] = coachRowEditSchema.parse(edit);
    }
    const alternatives: CoachEditorDraft["alternatives"] = {};
    for (const [key, rows] of Object.entries(old.alternativeEdits ?? {})) {
      const row = source.exercises.find((item) => item.id === key);
      if (!row) throw Error("missing alternative source");
      alternatives[key] = rows.map((item) => {
        const exercise =
          catalog.find((candidate) => candidate.id === item.exerciseId) ??
          row.alternatives.find((candidate) => candidate.exerciseId === item.exerciseId);
        if (!exercise || exercise.recordType !== null) throw Error("alternative type changed");
        return { exerciseId: item.exerciseId, input: legacyInput(item) };
      });
    }
    const fields: z.infer<typeof coachBulkFieldsSchema> = {};
    if (old.bulk?.setsEnabled) fields.sets = old.bulk.sets;
    if (old.bulk?.repsEnabled) {
      fields.repsMin = old.bulk.repsMin;
      fields.repsMax = old.bulk.repsMax;
    }
    if (old.bulk?.restEnabled) fields.restSeconds = old.bulk.restSeconds;
    const draft = coachEditorDraftSchema.parse({
      version: 4,
      id: old.id,
      userId: old.userId,
      programId: old.programId,
      sessionId: old.sessionId,
      revision: old.revision,
      updatedAt: old.updatedAt,
      edits,
      ...(old.title !== undefined ? { title: old.title } : {}),
      ...(old.weekday !== undefined ? { weekday: old.weekday } : {}),
      selection: old.bulk?.ids ?? [],
      additionSelection: old.additionSelection ?? [],
      bulk: old.bulk ? { ids: old.bulk.ids, fields } : null,
      alternatives,
      order: old.order,
      pending: null,
      previousRaw: entry.raw,
    });
    return { ok: true, draft };
  } catch {
    return { ok: false, reason: "incompatible", entry };
  }
}
export type CoachEditorStorage = {
  get(key: string): Promise<string | null>;
  /** The browser adapter must serialize this operation with the same per-key Web Lock. */
  compareAndSet(key: string, before: string | null, next: string | null): Promise<void>;
};
type WriteResult =
  | { ok: true; raw: string }
  | { ok: false; reason: "storage" | "conflict" | "unknown" | "invalid" | "pending" };
export async function writeCoachEditorDraft(
  storage: CoachEditorStorage,
  value: CoachEditorDraft,
  before: string | null,
  options: { settledRequestId?: string } = {},
): Promise<WriteResult> {
  if (!coachEditorDraftSchema.safeParse(value).success) return { ok: false, reason: "invalid" };
  const key = coachEditorDraftKey(value),
    next = JSON.stringify(value);
  const original = decodeCoachEditorDraft(before, value);
  if (original.kind === "unknown") return { ok: false, reason: "unknown" };
  if ((original.kind === "current" || original.kind === "legacy") && original.draft.id !== value.id)
    return { ok: false, reason: "invalid" };
  if (
    original.kind === "legacy" &&
    (hasLegacyRequest(original.draft) || value.previousRaw !== before)
  )
    return { ok: false, reason: "invalid" };
  if (original.kind === "current") {
    const pending = original.draft.pending;
    // This fact belongs to the controller's authenticated response, never an editable local flag.
    const settled =
      pending !== null && options.settledRequestId === pending.id && value.pending === null;
    if (pending && canonical(pending) !== canonical(value.pending) && !settled)
      return { ok: false, reason: "pending" };
    if (original.draft.previousRaw !== value.previousRaw && !settled)
      return { ok: false, reason: "invalid" };
  }
  try {
    const latest = await storage.get(key);
    // Reconcile a previous local commit whose readback failed, without changing it again.
    if (latest === next) return { ok: true, raw: next };
    if (latest !== before) return { ok: false, reason: "conflict" };
    await storage.compareAndSet(key, before, next);
    if ((await storage.get(key)) !== next) return { ok: false, reason: "storage" };
    return { ok: true, raw: next };
  } catch (error) {
    return {
      ok: false,
      reason:
        error && typeof error === "object" && "reason" in error && error.reason === "conflict"
          ? "conflict"
          : "storage",
    };
  }
}
