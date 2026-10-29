import {
  coachSessionRequestSchema,
  type CoachSessionRequest,
  type CoachSessionResult,
} from "@/domain/coach-session-mutation";
import { parsePrescriptionInput, prescriptionToInput } from "@/domain/prescription-input";
import type { CoachCatalogExercise, CoachSessionRow } from "@/lib/data/coach-programs";
import type { CoachEditorScope, CoachEditorStoredEntry } from "./editor-browser";
import {
  coachEditorBase,
  coachEditorDraftKey,
  coachEditorDraftSchema,
  decodeCoachEditorDraft,
  migrateCoachEditorDraft,
  writeCoachEditorDraft,
  type CoachEditorDraft,
  type CoachEditorStorage,
} from "./typed-editor-draft";
import {
  prepareCoachRowChanges,
  effectiveCoachGoals,
  type CoachPrescriptionRow,
} from "./typed-prescription";
import { mergeCoachRowEdit } from "./editor-rebase";
import type { EditorDraft } from "./editor-draft";
import {
  confirmedCoachResult,
  confirmedLegacyResult,
  legacyEditorOperations,
  legacyFields,
  type LegacyOperation,
} from "./editor-receipts";
export { legacyEditorOperations } from "./editor-receipts";
type Reason =
  | "invalid"
  | "conflict"
  | "week_locked"
  | "not_found"
  | "forbidden"
  | "unauthenticated"
  | "uncertain"
  | "limit";
const reasons: Reason[] = [
  "invalid",
  "conflict",
  "week_locked",
  "not_found",
  "forbidden",
  "unauthenticated",
  "uncertain",
  "limit",
];
export const coachEditorMessages: Record<Reason, string> = {
  invalid: "Revisa los datos. Tu borrador se conserva.",
  conflict: "La sesión cambió. Revisa la versión actual antes de aplicar tus cambios.",
  week_locked: "La semana está bloqueada. Solo puedes editar semanas posteriores a la actual.",
  not_found: "La sesión o uno de sus ejercicios ya no está disponible. Tu borrador se conserva.",
  forbidden: "Tu cuenta no puede modificar esta sesión. Conservamos el intento.",
  unauthenticated: "Vuelve a iniciar sesión con la misma cuenta y reintenta este intento.",
  uncertain:
    "No recibimos confirmación. Reintenta el mismo intento para comprobarlo sin duplicar cambios.",
  limit: "La copia excede los límites de la sesión o semana.",
};
const localError =
  "No pudimos confirmar el guardado en este dispositivo. Conservamos tu propuesta; mantén esta página abierta y reintenta.";
export function coachEditorDirty(draft: CoachEditorDraft): boolean {
  return (
    Object.keys(draft.edits).length > 0 ||
    draft.title !== undefined ||
    draft.weekday !== undefined ||
    draft.selection.length > 0 ||
    draft.additionSelection.length > 0 ||
    !!draft.bulk ||
    Object.keys(draft.alternatives).length > 0 ||
    !!draft.order ||
    !!draft.pending
  );
}
type Dependencies = {
  storage: CoachEditorStorage;
  discover: () => { ok: boolean; entries: CoachEditorStoredEntry[] };
  mutate: (input: CoachEditorScope & { request: CoachSessionRequest }) => Promise<unknown>;
  review: (scope: CoachEditorScope) => Promise<CoachSessionRow | null>;
  legacy: (
    input: CoachEditorScope & { raw: string; operation: LegacyOperation },
  ) => Promise<unknown>;
  remember: (id: string) => void;
  createId: () => string;
  now: () => string;
};
type State = {
  ready: boolean;
  discovered: boolean;
  busy: boolean;
  source: CoachSessionRow;
  draft: CoachEditorDraft;
  entries: CoachEditorStoredEntry[];
  blocked: CoachEditorStoredEntry | null;
  storage: "clean" | "saved" | "error";
  storageConflict: boolean;
  error: string | null;
  issue: Reason | null;
  comparison: CoachSessionRow | null;
  confirmation: CoachSessionResult | null;
  lastResult: CoachSessionResult | null;
  lastOperation: CoachSessionRequest["operation"] | null;
  removed: boolean;
  needsRefresh: boolean;
  errors: Record<string, string>;
  copiedSessionId: string | null;
};
type Attempt = {
  before: string | null;
  raw: string | null;
  value: CoachEditorDraft | null;
  legacy: boolean;
  settledRequestId?: string;
};
function reason(value: unknown): Reason {
  return value &&
    typeof value === "object" &&
    Object.keys(value).length === 2 &&
    "ok" in value &&
    value.ok === false &&
    "reason" in value &&
    reasons.includes(value.reason as Reason)
    ? (value.reason as Reason)
    : "uncertain";
}
/** One coordinator per mounted session. Local protection precedes every remote operation. */
export class CoachSessionEditorController {
  private state: State;
  private listeners = new Set<() => void>();
  private raw: string | null = null;
  private flushing: Promise<boolean> | null = null;
  private lastAttempt: Attempt | null = null;
  private resolutionId: string | undefined;
  private confirmedRequest: CoachSessionRequest | null = null;
  private rejectedId: string | null = null;
  private legacyRejected: LegacyOperation | null = null;
  private legacyCopiedSessionId: string | null = null;
  constructor(
    private scope: CoachEditorScope,
    source: CoachSessionRow,
    private catalog: CoachCatalogExercise[],
    private deps: Dependencies,
  ) {
    this.state = {
      ready: false,
      discovered: false,
      busy: false,
      source,
      draft: this.empty(source),
      entries: [],
      blocked: null,
      storage: "clean",
      storageConflict: false,
      error: null,
      issue: null,
      comparison: null,
      confirmation: null,
      lastResult: null,
      lastOperation: null,
      removed: false,
      needsRefresh: false,
      errors: {},
      copiedSessionId: null,
    };
  }
  private empty(source: CoachSessionRow, id = this.deps.createId()): CoachEditorDraft {
    return {
      version: 4,
      ...this.scope,
      id,
      revision: source.revision,
      updatedAt: this.deps.now(),
      edits: {},
      selection: [],
      additionSelection: [],
      bulk: null,
      alternatives: {},
      order: null,
      pending: null,
      previousRaw: null,
      base: coachEditorBase(source),
    };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<State> = {}) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  get dirty() {
    return (
      !!this.state.blocked ||
      !!this.state.confirmation ||
      coachEditorDirty(this.state.draft) ||
      this.state.storage === "error"
    );
  }
  get conflict() {
    return this.state.draft.revision !== this.state.source.revision;
  }
  goals(row: CoachPrescriptionRow) {
    const edit = this.state.draft.edits[row.id];
    if (edit && edit.exerciseId !== row.exerciseId) return prescriptionToInput(row.prescribed);
    const base = this.conflict
      ? this.state.draft.base?.exercises.find(
          (base) => base.id === row.id && base.exerciseId === row.exerciseId,
        )
      : null;
    return effectiveCoachGoals(base ? { ...row, prescribed: base.prescribed } : row, edit);
  }
  async init(preferredId?: string, replaceMemory = false): Promise<boolean> {
    if (this.state.busy || (this.state.ready && this.dirty && !replaceMemory)) return false;
    this.publish({ busy: true });
    const found = this.deps.discover();
    if (!found.ok) {
      this.publish({
        ready: true,
        busy: false,
        discovered: false,
        entries: found.entries,
        storage: "error",
        error: localError,
      });
      return false;
    }
    const selected =
      found.entries.find((item) => item.key.endsWith(":" + preferredId)) ??
      (preferredId === "cleared" && !found.entries.some((item) => item.entry.kind === "unknown")
        ? undefined
        : found.entries[0]);
    this.raw = selected?.entry.raw ?? null;
    this.lastAttempt = null;
    this.resolutionId = undefined;
    this.confirmedRequest = null;
    this.rejectedId = null;
    this.legacyRejected = null;
    this.publish({
      ready: true,
      discovered: true,
      busy: false,
      entries: found.entries,
      blocked: null,
      comparison: null,
      confirmation: null,
      issue: null,
      error: null,
      removed: false,
      needsRefresh: false,
      errors: {},
      lastResult: null,
      lastOperation: null,
      copiedSessionId: null,
      storage: selected ? "saved" : "clean",
      draft: this.empty(this.state.source),
    });
    if (!selected) return true;
    if (selected.entry.kind === "current") {
      this.publish({ draft: selected.entry.draft });
      return true;
    }
    this.publish({ blocked: selected });
    return selected.entry.kind === "legacy" ? this.migrateLegacy() : false;
  }
  receiveSource(source: CoachSessionRow) {
    if (source.id !== this.scope.sessionId || source.revision < this.state.source.revision) return;
    if (!this.dirty && !this.state.busy)
      this.publish({
        source,
        draft: this.empty(source, this.state.draft.id),
        needsRefresh: false,
        removed: false,
      });
    else this.publish({ source });
  }
  change(update: (draft: CoachEditorDraft) => CoachEditorDraft): boolean {
    if (
      !this.state.ready ||
      !this.state.discovered ||
      this.state.busy ||
      this.state.blocked ||
      this.state.draft.pending ||
      this.state.confirmation ||
      this.state.removed ||
      this.state.needsRefresh
    )
      return false;
    const parsed = coachEditorDraftSchema.safeParse({
      ...update(this.state.draft),
      updatedAt: this.deps.now(),
    });
    if (!parsed.success) {
      this.publish({
        error: "Revisa los campos del borrador. No se descartaron los valores protegidos.",
      });
      return false;
    }
    this.publish({ draft: parsed.data, error: null, lastResult: null, errors: {} });
    void this.flush();
    return true;
  }
  private async commit(attempt: Attempt): Promise<boolean> {
    try {
      if (attempt.value) {
        const result = await writeCoachEditorDraft(
          this.deps.storage,
          attempt.value,
          attempt.before,
          { settledRequestId: attempt.settledRequestId },
        );
        if (!result.ok) {
          this.publish({
            storage: "error",
            storageConflict: result.reason === "conflict",
            error:
              result.reason === "conflict"
                ? "El borrador cambió en otra ventana. Conservamos tu propuesta aquí sin sobrescribir la otra versión."
                : localError,
          });
          return false;
        }
      } else {
        const key = this.state.blocked?.key ?? coachEditorDraftKey(this.state.draft);
        const latest = await this.deps.storage.get(key);
        if (latest !== attempt.raw)
          await this.deps.storage.compareAndSet(key, attempt.before, attempt.raw);
        if ((await this.deps.storage.get(key)) !== attempt.raw) throw Error("readback");
      }
      this.raw = attempt.raw;
      this.lastAttempt = null;
      this.publish({
        storage: this.raw === null ? "clean" : "saved",
        error: null,
        storageConflict: false,
      });
      this.deps.remember(
        this.raw === null
          ? "cleared"
          : (this.state.blocked?.key.split(":").at(-1) ?? this.state.draft.id),
      );
      return true;
    } catch (error) {
      this.publish({
        storage: "error",
        storageConflict: !!(
          error &&
          typeof error === "object" &&
          "reason" in error &&
          error.reason === "conflict"
        ),
        error:
          error && typeof error === "object" && "reason" in error && error.reason === "conflict"
            ? "El borrador cambió en otra ventana. Conservamos tu propuesta aquí sin sobrescribir la otra versión."
            : localError,
      });
      return false;
    }
  }
  async flush(): Promise<boolean> {
    if (this.flushing) return this.flushing;
    if (!this.state.discovered) return false;
    const run = async () => {
      for (;;) {
        if (this.lastAttempt && !(await this.commit(this.lastAttempt))) return false;
        const blocked = this.state.blocked;
        if (blocked?.entry.kind === "unknown") return false;
        if (blocked?.entry.kind === "legacy") {
          const next = blocked.entry.raw;
          if (next === this.raw) {
            if (!(await this.commit({ before: this.raw, raw: next, value: null, legacy: true })))
              return false;
            if (
              this.state.blocked?.entry.kind === "legacy" &&
              this.state.blocked.entry.raw === next
            )
              return true;
            continue;
          }
          this.lastAttempt = { before: this.raw, raw: next, value: null, legacy: true };
        } else {
          const draft = this.state.draft,
            next = coachEditorDirty(draft) ? JSON.stringify(draft) : null;
          if (next === this.raw) {
            if (
              !(await this.commit({
                before: this.raw,
                raw: next,
                value: next === null ? null : draft,
                legacy: false,
                settledRequestId: this.resolutionId,
              }))
            )
              return false;
            const latest = coachEditorDirty(this.state.draft)
              ? JSON.stringify(this.state.draft)
              : null;
            if (!this.state.blocked && latest === next) return true;
            continue;
          }
          if (next === null && this.raw !== null) {
            const previous = decodeCoachEditorDraft(this.raw, this.scope);
            if (
              previous.kind === "current" &&
              previous.draft.pending &&
              previous.draft.pending.id !== this.resolutionId
            ) {
              this.publish({ storage: "error", error: coachEditorMessages.uncertain });
              return false;
            }
          }
          this.lastAttempt = {
            before: this.raw,
            raw: next,
            value: next === null ? null : draft,
            legacy: false,
            settledRequestId: this.resolutionId,
          };
        }
      }
    };
    const task = run();
    this.flushing = task;
    try {
      return await task;
    } finally {
      if (this.flushing === task) this.flushing = null;
    }
  }
  private available() {
    return (
      this.state.ready &&
      this.state.discovered &&
      !this.state.busy &&
      !this.state.blocked &&
      !this.state.confirmation &&
      !this.state.removed &&
      !this.state.needsRefresh &&
      !this.conflict
    );
  }
  async save(): Promise<boolean> {
    if (!this.available() || this.state.draft.pending) return false;
    const draft = this.state.draft;
    if (
      draft.selection.length ||
      draft.bulk ||
      draft.additionSelection.length ||
      Object.keys(draft.alternatives).length ||
      draft.order
    )
      return false;
    try {
      const rows: Extract<CoachSessionRequest, { operation: "prescribe" }>["data"]["rows"] = [],
        errors: Record<string, string> = {};
      for (const edit of Object.values(draft.edits)) {
        const row = this.state.source.exercises.find((row) => row.id === edit.id);
        if (!row) {
          errors[edit.id] = "El ejercicio fue retirado. Revisa la versión actual.";
          continue;
        }
        try {
          rows.push({
            id: edit.id,
            exerciseId: edit.exerciseId,
            changes: prepareCoachRowChanges(row, edit),
          });
        } catch {
          let message = "Revisa las series y los objetivos de este ejercicio.";
          if (edit.note !== undefined && Array.from(edit.note).length > 500)
            message = "La nota admite hasta 500 caracteres.";
          try {
            const goals = effectiveCoachGoals(row, edit),
              targets = goals.mode === "series" ? goals.series : [goals.target];
            if (
              targets.some(
                (target) =>
                  /^\d+$/.test(target.repsMin) &&
                  /^\d+$/.test(target.repsMax) &&
                  Number(target.repsMin) > Number(target.repsMax),
              )
            )
              message = "El mínimo de repeticiones no puede superar el máximo.";
          } catch {
            /* The original partial input remains in the draft. */
          }
          errors[edit.id] = message;
        }
      }
      if (Object.keys(errors).length) {
        this.publish({
          errors,
          error: "Revisa los ejercicios marcados antes de guardar. El borrador se conserva.",
        });
        return false;
      }
      return this.begin("prescribe", {
        rows,
        ...(draft.title !== undefined ? { title: draft.title } : {}),
        ...(draft.weekday !== undefined ? { weekday: draft.weekday } : {}),
      });
    } catch {
      this.publish({
        error: "Revisa los objetivos antes de guardar. El texto incompleto se conserva.",
      });
      return false;
    }
  }
  async command(
    operation: Exclude<CoachSessionRequest["operation"], "prescribe">,
    data: unknown,
  ): Promise<boolean> {
    if (!this.available() || this.state.draft.pending) return false;
    const draft = this.state.draft;
    if (
      Object.keys(draft.edits).length ||
      draft.title !== undefined ||
      draft.weekday !== undefined ||
      draft.bulk
    )
      return false;
    if (operation !== "add" && draft.additionSelection.length) return false;
    if (operation !== "alternatives" && Object.keys(draft.alternatives).length) return false;
    if (operation !== "layout" && draft.selection.length) return false;
    return this.begin(operation, data);
  }
  async saveAlternatives(rowId: string): Promise<boolean> {
    const rows = this.state.draft.alternatives[rowId];
    if (!rows) return false;
    try {
      const alternatives = rows.map((row) => ({
        exerciseId: row.exerciseId,
        prescribed: parsePrescriptionInput(row.input),
      }));
      return this.command("alternatives", { rowId, alternatives });
    } catch {
      this.publish({ error: "Revisa los objetivos de las alternativas. Conservamos tu borrador." });
      return false;
    }
  }
  private async begin(operation: string, data: unknown): Promise<boolean> {
    const parsed = coachSessionRequestSchema.safeParse({
      version: 2,
      id: this.deps.createId(),
      revision: this.state.draft.revision,
      operation,
      data,
    });
    if (!parsed.success) {
      this.publish({ error: coachEditorMessages.invalid });
      return false;
    }
    const request = parsed.data;
    this.publish({
      busy: true,
      error: null,
      issue: null,
      lastResult: null,
      errors: {},
      draft: {
        ...this.state.draft,
        pending: request,
        ...(request.operation === "order" ? { order: request.data.ids } : {}),
      },
    });
    return this.send(request);
  }
  private async send(request: CoachSessionRequest): Promise<boolean> {
    if (!(await this.flush())) {
      this.publish({ busy: false });
      return false;
    }
    let reply: unknown;
    try {
      reply = await this.deps.mutate({ ...this.scope, request });
    } catch {
      reply = null;
    }
    const result = confirmedCoachResult(reply, request, this.scope.sessionId);
    if (result) {
      this.confirmedRequest = request;
      this.resolutionId = request.id;
      this.publish({ confirmation: result });
      return this.finish(result, request);
    }
    const failure = reason(reply);
    this.rejectedId = failure !== "uncertain" && failure !== "unauthenticated" ? request.id : null;
    this.publish({ busy: false, issue: failure, error: coachEditorMessages[failure] });
    return false;
  }
  private async finish(result: CoachSessionResult, request: CoachSessionRequest): Promise<boolean> {
    let latest: CoachSessionRow | null = null,
      readFailed = false;
    try {
      latest = await this.deps.review(this.scope);
    } catch {
      readFailed = true;
    }
    if (latest && (latest.id !== this.scope.sessionId || latest.revision < result.revision)) {
      latest = null;
      readFailed = true;
    }
    if (readFailed && this.state.source.revision >= result.revision) latest = this.state.source;
    const draft = {
      ...this.state.draft,
      pending: null,
      previousRaw: null,
      revision: latest?.revision ?? result.revision,
      base: latest ? coachEditorBase(latest) : null,
    };
    if (request.operation === "prescribe") {
      draft.edits = {};
      delete draft.title;
      delete draft.weekday;
    }
    if (request.operation === "alternatives") {
      draft.alternatives = { ...draft.alternatives };
      delete draft.alternatives[request.data.rowId];
    }
    if (request.operation === "add") draft.additionSelection = [];
    if (request.operation === "order") draft.order = null;
    if (request.operation === "layout") draft.selection = [];
    this.publish({
      draft,
      ...(latest ? { source: latest } : {}),
      removed: !latest && !readFailed,
      needsRefresh: !latest && readFailed,
    });
    const cleaned = await this.flush();
    if (cleaned) {
      this.confirmedRequest = null;
      this.rejectedId = null;
      this.publish({
        confirmation: null,
        lastResult: result,
        lastOperation: request.operation,
        copiedSessionId:
          request.operation === "duplicate" && request.data.rowId === null
            ? request.data.copyId
            : this.state.copiedSessionId,
        issue: null,
        error:
          readFailed && !latest
            ? "El servidor confirmó el cambio. Falta actualizar la sesión; reintenta la lectura."
            : null,
      });
    }
    this.publish({ busy: false });
    return cleaned;
  }
  async retry(): Promise<boolean> {
    if (this.state.busy) return false;
    if (!this.state.discovered) return this.init(undefined, true);
    if (this.state.blocked)
      return this.state.blocked.entry.kind === "legacy" ? this.migrateLegacy() : false;
    if (this.state.confirmation && this.confirmedRequest) {
      this.publish({ busy: true });
      return this.finish(this.state.confirmation, this.confirmedRequest);
    }
    if (this.state.draft.pending) {
      this.publish({ busy: true, error: null });
      return this.send(this.state.draft.pending);
    }
    if (this.state.needsRefresh) {
      await this.review();
      if (this.state.comparison) {
        this.receiveSource(this.state.comparison);
        this.publish({ needsRefresh: false, comparison: null, error: null });
        return true;
      }
      return false;
    }
    return this.flush();
  }
  async review(): Promise<boolean> {
    if (
      this.state.busy ||
      this.state.blocked ||
      (this.state.draft.pending && this.rejectedId !== this.state.draft.pending.id)
    )
      return false;
    this.publish({ busy: true });
    try {
      const latest = await this.deps.review(this.scope);
      if (!latest || latest.id !== this.scope.sessionId) throw Error("missing");
      this.publish({ comparison: latest, error: null });
      return true;
    } catch {
      this.publish({
        error: "No se pudo cargar la versión actual. Tu borrador permanece en este dispositivo.",
      });
      return false;
    } finally {
      this.publish({ busy: false });
    }
  }
  async approveReview(dropMissing = false, discardStructure = false): Promise<boolean> {
    const latest = this.state.comparison,
      draft = this.state.draft;
    if (!latest || this.state.busy || (draft.pending && this.rejectedId !== draft.pending.id))
      return false;
    if (
      (draft.pending?.operation === "order" || draft.pending?.operation === "layout") &&
      !discardStructure
    ) {
      this.publish({
        error: "Revisa y descarta explícitamente el orden o grupo rechazado antes de continuar.",
      });
      return false;
    }
    try {
      const edits: CoachEditorDraft["edits"] = {};
      for (const edit of Object.values(draft.edits)) {
        const current = latest.exercises.find(
          (row) => row.id === edit.id && row.exerciseId === edit.exerciseId,
        );
        if (!current) {
          if (dropMissing) continue;
          throw Error("missing");
        }
        edits[edit.id] = mergeCoachRowEdit(
          draft.base?.exercises.find((row) => row.id === edit.id) ?? null,
          current,
          edit,
        );
      }
      const alternatives = { ...draft.alternatives };
      for (const id of Object.keys(alternatives))
        if (!latest.exercises.some((row) => row.id === id)) {
          if (!dropMissing) throw Error("missing");
          delete alternatives[id];
        }
      this.resolutionId = draft.pending?.id;
      const next: CoachEditorDraft = {
        ...draft,
        edits,
        alternatives,
        revision: latest.revision,
        base: coachEditorBase(latest),
        pending: null,
        order: discardStructure ? null : draft.order,
        selection: draft.selection.filter((id) => latest.exercises.some((row) => row.id === id)),
      };
      this.publish({ source: latest, draft: next, comparison: null, issue: null, error: null });
      return this.flush();
    } catch {
      this.publish({
        error:
          "Revisa los ejercicios retirados y completa los valores pendientes antes de combinar. Tus cambios se conservan.",
      });
      return false;
    }
  }
  async discard(confirmed = false): Promise<boolean> {
    if (
      !confirmed ||
      this.state.busy ||
      this.state.blocked ||
      (this.state.draft.pending && this.rejectedId !== this.state.draft.pending.id)
    )
      return false;
    this.publish({ busy: true });
    try {
      const latest = await this.deps.review(this.scope);
      if (
        latest &&
        (latest.id !== this.scope.sessionId || latest.revision < this.state.source.revision)
      )
        throw Error("stale");
      this.resolutionId = this.state.draft.pending?.id;
      const current = latest ?? this.state.source;
      this.publish({
        source: current,
        draft: this.empty(current, this.state.draft.id),
        removed: latest === null,
        comparison: null,
        error: null,
        issue: null,
        needsRefresh: false,
      });
      return await this.flush();
    } catch {
      this.publish({
        error:
          "No se pudo cargar la versión actual. Tu propuesta sigue protegida; reintenta antes de descartarla.",
      });
      return false;
    } finally {
      this.publish({ busy: false });
    }
  }

  async fork(): Promise<boolean> {
    if (!this.state.storageConflict || this.state.busy || this.state.blocked) return false;
    const draft = {
      ...this.state.draft,
      id: this.deps.createId(),
      previousRaw: null,
      updatedAt: this.deps.now(),
    };
    this.raw = null;
    this.lastAttempt = null;
    this.publish({ draft, storage: "clean", storageConflict: false, error: null });
    return this.flush();
  }
  async migrateLegacy(): Promise<boolean> {
    const selected = this.state.blocked;
    if (!selected || selected.entry.kind !== "legacy") return false;
    if (this.state.needsRefresh) {
      this.publish({ busy: true });
      try {
        const latest = await this.deps.review(this.scope);
        if (!latest || latest.id !== this.scope.sessionId) {
          this.publish({
            removed: true,
            error: "El servidor confirmó el intento, pero la sesión ya no está disponible.",
          });
          return false;
        }
        this.publish({ source: latest, needsRefresh: false });
      } catch {
        this.publish({
          error: "El intento está confirmado. Falta recuperar la versión actual de la sesión.",
        });
        return false;
      } finally {
        this.publish({ busy: false });
      }
    }
    const migration = migrateCoachEditorDraft(selected.entry, this.state.source, this.catalog);
    if (!migration.ok) return false;
    this.publish({
      blocked: null,
      draft: coachEditorDirty(migration.draft)
        ? migration.draft
        : this.empty(this.state.source, migration.draft.id),
    });
    if (await this.flush()) {
      if (this.legacyCopiedSessionId) {
        this.publish({ copiedSessionId: this.legacyCopiedSessionId });
        this.legacyCopiedSessionId = null;
      }
      return true;
    }
    // Keep the migration proposal in memory; retry flush reconciles the same local document.
    return false;
  }
  legacyChange(update: (draft: EditorDraft) => EditorDraft): boolean {
    const selected = this.state.blocked;
    if (
      this.state.busy ||
      selected?.entry.kind !== "legacy" ||
      legacyEditorOperations(selected.entry.draft).length
    )
      return false;
    const draft = update(selected.entry.draft),
      raw = JSON.stringify(draft),
      entry = decodeCoachEditorDraft(raw, this.scope);
    if (entry.kind !== "legacy") return false;
    this.publish({ blocked: { key: selected.key, entry }, error: null });
    void this.flush();
    return true;
  }
  async reconcileLegacy(operation: LegacyOperation): Promise<boolean> {
    const selected = this.state.blocked;
    if (
      this.state.busy ||
      selected?.entry.kind !== "legacy" ||
      !legacyEditorOperations(selected.entry.draft).includes(operation)
    )
      return false;
    this.publish({ busy: true, error: null });
    if (!(await this.flush())) {
      this.publish({ busy: false });
      return false;
    }
    let reply: unknown;
    try {
      reply = await this.deps.legacy({ ...this.scope, raw: selected.entry.raw, operation });
    } catch {
      reply = null;
    }
    if (!confirmedLegacyResult(reply, selected.entry.draft, operation, this.scope.sessionId)) {
      const failure = reason(reply);
      this.legacyRejected =
        failure !== "uncertain" && failure !== "unauthenticated" ? operation : null;
      this.publish({ busy: false, issue: failure, error: coachEditorMessages[failure] });
      return false;
    }
    const draft = { ...selected.entry.draft };
    if (operation === "copy" && !draft.copyRequest?.exerciseId)
      this.legacyCopiedSessionId = draft.copyRequest!.id;
    if (operation === "save") {
      draft.edits = Object.fromEntries(
        Object.entries(draft.edits).filter(
          ([id]) => !draft.saveRequest!.rows.some((row) => row.id === id),
        ),
      );
      if (draft.saveRequest?.title !== undefined) delete draft.title;
      if (draft.saveRequest?.weekday !== undefined) delete draft.weekday;
    }
    if (operation === "order") draft.order = null;
    if (operation === "alternatives") {
      draft.alternativeEdits = { ...draft.alternativeEdits };
      delete draft.alternativeEdits[draft.alternativeRequest!.exerciseRowId];
    }
    if (operation === "add") draft.additionSelection = [];
    draft[legacyFields[operation]] = null;
    const entry = decodeCoachEditorDraft(JSON.stringify(draft), this.scope);
    if (entry.kind !== "legacy") {
      this.publish({ busy: false, error: localError });
      return false;
    }
    this.publish({ blocked: { key: selected.key, entry }, issue: null, needsRefresh: true });
    const protectedUpdate = await this.flush();
    if (protectedUpdate) {
      try {
        const latest = await this.deps.review(this.scope);
        if (latest && latest.id === this.scope.sessionId)
          this.publish({ source: latest, needsRefresh: false });
      } catch {
        /* Confirmed request remains cleared only after verified local write. */
      }
    }
    this.publish({ busy: false });
    return protectedUpdate ? this.migrateLegacy() : false;
  }
  async resolveLegacyRejected(): Promise<boolean> {
    const selected = this.state.blocked,
      operation = this.legacyRejected;
    if (!operation || selected?.entry.kind !== "legacy" || this.state.busy) return false;
    const draft = { ...selected.entry.draft };
    draft[legacyFields[operation]] = null;
    if (operation === "order") draft.order = null;
    const entry = decodeCoachEditorDraft(JSON.stringify(draft), this.scope);
    if (entry.kind !== "legacy") return false;
    this.publish({ blocked: { key: selected.key, entry }, issue: null, error: null });
    if (!(await this.flush())) return false;
    this.legacyRejected = null;
    return this.migrateLegacy();
  }
}
