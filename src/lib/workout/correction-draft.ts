import { z } from "zod";
import { isWorkoutEditable } from "../../domain/edit-window";
import {
  workoutCorrectionSnapshotSchema,
  workoutCorrectionSchema,
  workoutCorrectionReceiptSchema,
  type WorkoutCorrectionSnapshot,
  type WorkoutCorrection,
  type WorkoutCorrectionReceipt,
} from "../mobile/workout-correction-contracts";
import {
  correctionFormFromSnapshot,
  correctionFromForm,
  validateCorrectionForm,
  workoutCorrectionFormSchema,
  mergeCorrectionForm,
  type WorkoutCorrectionForm,
} from "./correction-form";
export type CorrectionStorage = {
  get(key: string): Promise<string | null>;
  compareAndSet(key: string, before: string | null, next: string): Promise<void>;
};
const issueSchema = z.enum([
  "conflict",
  "not_found",
  "invalid_input",
  "forbidden",
  "edit_locked",
  "removed",
]);
type Issue = z.infer<typeof issueSchema>;
const draftSchema = z
  .object({
    base: workoutCorrectionSnapshotSchema,
    form: workoutCorrectionFormSchema,
    changed: z.boolean(),
  })
  .strict();
export const workoutCorrectionDraftSchema = z
  .object({
    version: z.literal(1),
    userId: z.uuid(),
    draft: draftSchema.nullable(),
    pending: z
      .object({ request: workoutCorrectionSchema, issue: issueSchema.nullable() })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((doc, context) => {
    try {
      if (doc.draft) {
        if (doc.draft.base.userId !== doc.userId) throw Error("identity");
        validateCorrectionForm(doc.draft.base, doc.draft.form);
        if (
          doc.draft.changed !==
          (JSON.stringify(doc.draft.form) !==
            JSON.stringify(correctionFormFromSnapshot(doc.draft.base)))
        )
          throw Error("changed");
      }
      if (doc.pending) {
        if (
          !doc.draft?.changed ||
          JSON.stringify(
            correctionFromForm(doc.draft.base, doc.draft.form, doc.pending.request.requestId),
          ) !== JSON.stringify(doc.pending.request)
        )
          throw Error("pending");
      }
    } catch {
      context.addIssue({
        code: "custom",
        message: "El borrador no corresponde a su cuenta, base o petición.",
      });
    }
  });
type Document = z.infer<typeof workoutCorrectionDraftSchema>;
type Comparison = ReturnType<typeof mergeCorrectionForm> & { latest: WorkoutCorrectionSnapshot };
type State = Document & {
  ready: boolean;
  busy: boolean;
  dirty: boolean;
  blocked: boolean;
  paused: boolean;
  error: string | null;
  confirmation: WorkoutCorrectionReceipt | null;
  comparison: Comparison | null;
};
const conflict = () =>
  Object.assign(Error("El contenido cambió en otra ventana."), { reason: "conflict" });
const storageMessage = (error: unknown) =>
  error && typeof error === "object" && "reason" in error && error.reason === "conflict"
    ? "La corrección local cambió en otra ventana. Conservamos tu propuesta en memoria sin sobrescribir la otra versión."
    : "No pudimos confirmar el guardado en este dispositivo. Conservamos tu propuesta; revisa el almacenamiento y reintenta.";
const issues: Record<Issue, string> = {
  conflict: "El entrenamiento cambió. Revisa la versión actual antes de aplicar tu propuesta.",
  not_found: "El entrenamiento ya no está disponible. Conservamos tu propuesta.",
  invalid_input: "El servidor rechazó los datos. Conservamos la propuesta para revisarla.",
  forbidden: "Tu cuenta no puede corregir este entrenamiento. Conservamos tu propuesta.",
  edit_locked: "Terminó el plazo para corregir este entrenamiento. Conservamos tu propuesta.",
  removed: "Este entrenamiento fue eliminado. Conservamos la propuesta hasta que la descartes.",
};
export function workoutCorrectionIssueMessage(issue: Issue | null) {
  return issue === null ? null : issues[issue];
}
export function correctionDraftKey(userId: string) {
  return `is:workout-correction:v1:${z.uuid().parse(userId).toLowerCase()}`;
}
/** Shared pure coordinator: adapters own SQLite/Web Locks; UI owns explicit confirmations. */
export class WorkoutCorrectionController {
  readonly key: string;
  private state: State;
  private raw: string | null = null;
  private attemptedRaw: string | undefined;
  private tail: Promise<void> = Promise.resolve();
  private sequence = 0;
  private epoch = 0;
  private reservation = 0;
  private disposed = false;
  private reviewed: { document: string; comparison: Comparison } | null = null;
  private listeners = new Set<() => void>();
  constructor(
    private userId: string,
    private storage: CorrectionStorage,
    private send: (input: WorkoutCorrection) => Promise<unknown>,
    private uuid: () => string,
  ) {
    this.userId = z.uuid().parse(userId).toLowerCase();
    this.key = correctionDraftKey(this.userId);
    this.state = {
      ...this.empty(),
      ready: false,
      busy: false,
      dirty: false,
      blocked: false,
      paused: false,
      error: null,
      confirmation: null,
      comparison: null,
    };
  }
  private empty(): Document {
    return { version: 1, userId: this.userId, draft: null, pending: null };
  }
  private document(): Document {
    return {
      version: 1,
      userId: this.userId,
      draft: this.state.draft,
      pending: this.state.pending,
    };
  }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(next: Partial<State>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((fn) => fn());
  }
  private current(epoch: number) {
    if (epoch !== this.epoch || this.disposed)
      throw Error("La cuenta cambió. Conservamos el intento en su cuenta original.");
  }
  private ensure() {
    if (
      !this.state.ready ||
      this.state.busy ||
      this.state.blocked ||
      this.state.paused ||
      this.disposed
    )
      throw Error("Espera o recupera los cambios locales antes de continuar.");
  }
  private resetComparison() {
    this.reviewed = null;
    this.publish({ comparison: null });
  }
  async restore() {
    if (this.state.ready && (this.state.dirty || this.state.draft?.changed || this.state.pending))
      throw Error("Confirma el descarte de la propuesta en memoria antes de releer.");
    await this.loadStored();
  }
  private async loadStored() {
    if (this.state.paused || (this.state.busy && !this.disposed)) return;
    this.disposed = false;
    const epoch = ++this.epoch;
    this.publish({ busy: true });
    try {
      await this.tail;
      this.current(epoch);
      const raw = await this.storage.get(this.key),
        doc = raw === null ? this.empty() : workoutCorrectionDraftSchema.parse(JSON.parse(raw));
      this.current(epoch);
      if (doc.userId !== this.userId) throw Error("identity");
      this.raw = raw;
      this.attemptedRaw = undefined;
      this.reviewed = null;
      this.publish({
        ...doc,
        ready: true,
        dirty: false,
        blocked: false,
        error: null,
        confirmation: null,
        comparison: null,
      });
    } catch {
      if (epoch === this.epoch && !this.disposed)
        this.publish({
          ready: true,
          blocked: true,
          error:
            "No pudimos recuperar la corrección local. Conservamos el contenido; reintenta con una versión compatible.",
        });
    } finally {
      if (epoch === this.epoch && !this.disposed) this.publish({ busy: false });
    }
  }
  async reloadLocal(discardMemory = false) {
    if (this.state.busy || this.state.paused || this.disposed)
      throw Error("Espera a que termine la operación actual.");
    if ((this.state.dirty || this.state.draft?.changed || this.state.pending) && !discardMemory)
      throw Error("Confirma el descarte de la propuesta en memoria antes de releer.");
    await this.loadStored();
  }
  private write(doc: Document, epoch?: number) {
    const encoded = JSON.stringify(workoutCorrectionDraftSchema.parse(doc)),
      sequence = ++this.sequence;
    this.publish({ dirty: true });
    const operation = async () => {
      if (epoch !== undefined) this.current(epoch);
      const raw = await this.storage.get(this.key);
      if (epoch !== undefined) this.current(epoch);
      if (raw !== this.raw && raw !== this.attemptedRaw) throw conflict();
      this.attemptedRaw = encoded;
      await this.storage.compareAndSet(this.key, raw, encoded);
      if ((await this.storage.get(this.key)) !== encoded) throw Error("verification");
      this.raw = encoded;
      this.attemptedRaw = undefined;
    };
    const next = this.tail.then(operation, operation);
    this.tail = next.then(
      () => {},
      () => {},
    );
    return next.then(
      () => {
        if (sequence === this.sequence && !this.disposed)
          this.publish({ dirty: false, error: null });
      },
      (error) => {
        const message = storageMessage(error);
        if (sequence === this.sequence && !this.disposed)
          this.publish({ dirty: true, error: message });
        throw Error(message);
      },
    );
  }
  private async put(doc: Document) {
    const parsed = workoutCorrectionDraftSchema.parse(doc);
    this.publish(parsed);
    await this.write(parsed);
  }
  async flush() {
    await this.tail;
    if (this.state.dirty)
      throw Error(this.state.error ?? "Quedan cambios sin proteger en este dispositivo.");
  }
  async open(value: WorkoutCorrectionSnapshot) {
    this.ensure();
    if (this.state.pending || this.state.draft?.changed || this.state.dirty)
      throw Error("Retoma o descarta primero la corrección pendiente.");
    const base = workoutCorrectionSnapshotSchema.parse(value);
    if (base.userId !== this.userId) throw Error("El resultado no corresponde a esta cuenta.");
    if (!isWorkoutEditable(base.workout.performedOn, base.today)) throw Error(issues.edit_locked);
    this.resetComparison();
    this.publish({ confirmation: null });
    await this.put({
      ...this.empty(),
      draft: { base, form: correctionFormFromSnapshot(base), changed: false },
    });
  }
  async change(value: WorkoutCorrectionForm) {
    this.ensure();
    const draft = this.state.draft;
    if (!draft || this.state.pending) throw Error("Resuelve el intento pendiente antes de editar.");
    const form = validateCorrectionForm(draft.base, value),
      changed = JSON.stringify(form) !== JSON.stringify(correctionFormFromSnapshot(draft.base));
    this.resetComparison();
    this.publish({ confirmation: null });
    await this.put({ ...this.document(), draft: { ...draft, form, changed } });
  }
  async discard() {
    this.ensure();
    const epoch = this.epoch;
    await this.write(this.empty(), epoch);
    this.current(epoch);
    this.reviewed = null;
    this.publish({ ...this.empty(), comparison: null, confirmation: null });
  }
  private async finishConfirmation(epoch: number) {
    const receipt = this.state.confirmation;
    if (!receipt || receipt.status === "removed") throw Error("No hay confirmación para limpiar.");
    await this.write(this.empty(), epoch);
    this.current(epoch);
    this.reviewed = null;
    this.publish({ ...this.empty(), confirmation: receipt, comparison: null });
  }
  async retryStorage() {
    this.ensure();
    const epoch = this.epoch;
    this.publish({ busy: true });
    try {
      if (this.state.confirmation && this.state.confirmation.status !== "removed")
        await this.finishConfirmation(epoch);
      else await this.write(this.document(), epoch);
    } finally {
      if (epoch === this.epoch && !this.disposed) this.publish({ busy: false });
    }
  }
  pauseWrites() {
    if (!this.state.ready || this.state.busy || this.state.paused || this.disposed)
      throw Error("Espera a que termine la lectura o el envío de correcciones.");
    const reservation = ++this.reservation;
    this.publish({ paused: true });
    let held = true;
    return () => {
      if (held) {
        held = false;
        if (!this.disposed && reservation === this.reservation) this.publish({ paused: false });
      }
    };
  }
  async clearForLogout() {
    const epoch = this.epoch;
    this.current(epoch);
    if (
      !this.state.paused ||
      !this.state.ready ||
      this.state.blocked ||
      this.state.draft?.changed ||
      this.state.pending
    )
      throw Error("Resuelve la corrección pendiente antes de salir.");
    await this.flush();
    this.current(epoch);
    await this.write(this.empty(), epoch);
    this.current(epoch);
    this.reviewed = null;
    this.publish({ ...this.empty(), comparison: null, confirmation: null });
  }
  async resumeEditing() {
    this.ensure();
    if (this.state.pending?.issue !== "invalid_input")
      throw Error("Resuelve el intento o revisa el conflicto antes de editar.");
    await this.put({ ...this.document(), pending: null });
    this.publish({ error: null, confirmation: null });
  }
  async retryRejected() {
    this.ensure();
    const pending = this.state.pending;
    if (!pending?.issue || !["forbidden", "not_found", "edit_locked"].includes(pending.issue))
      throw Error("Revisa el rechazo antes de reintentar este documento.");
    await this.put({ ...this.document(), pending: { ...pending, issue: null } });
    this.publish({ error: null });
  }
  prepareComparison(value: WorkoutCorrectionSnapshot) {
    this.ensure();
    const draft = this.state.draft;
    if (!draft || (this.state.pending && this.state.pending.issue !== "conflict"))
      throw Error("Reintenta el documento incierto antes de cambiar la revisión.");
    const latest = workoutCorrectionSnapshotSchema.parse(value),
      comparison = { ...mergeCorrectionForm(draft.base, draft.form, latest), latest };
    this.reviewed = { document: JSON.stringify(this.document()), comparison };
    this.publish({ comparison });
  }
  async acceptComparison(acceptUnapplied = false) {
    this.ensure();
    const reviewed = this.reviewed;
    if (!reviewed || reviewed.document !== JSON.stringify(this.document()))
      throw Error("La propuesta cambió. Revisa otra vez la comparación.");
    if (reviewed.comparison.unapplied.length && !acceptUnapplied)
      throw Error("Confirma los cambios que no se pueden aplicar a series eliminadas.");
    const base = reviewed.comparison.latest,
      form = reviewed.comparison.form;
    const doc: Document = {
      ...this.empty(),
      draft: {
        base,
        form,
        changed: JSON.stringify(form) !== JSON.stringify(correctionFormFromSnapshot(base)),
      },
    };
    this.publish({ confirmation: null });
    await this.put(doc);
    this.resetComparison();
  }
  async submit(): Promise<WorkoutCorrectionReceipt> {
    this.ensure();
    const epoch = this.epoch;
    if (this.state.pending?.issue) throw Error(issues[this.state.pending.issue]);
    this.publish({ busy: true, error: null });
    try {
      if (this.state.confirmation && this.state.confirmation.status !== "removed") {
        const saved = this.state.confirmation;
        await this.finishConfirmation(epoch);
        return saved;
      }
      await this.flush();
      this.current(epoch);
      let request = this.state.pending?.request;
      if (!request) {
        const draft = this.state.draft;
        if (!draft?.changed) throw Error("No hay cambios para guardar.");
        if (!isWorkoutEditable(draft.base.workout.performedOn, draft.base.today))
          throw Error(issues.edit_locked);
        const prepared = correctionFromForm(draft.base, draft.form, draft.base.workout.id);
        request = workoutCorrectionSchema.parse({ ...prepared, requestId: this.uuid() });
        await this.put({ ...this.document(), pending: { request, issue: null } });
      }
      this.current(epoch);
      if ((await this.storage.get(this.key)) !== this.raw) {
        this.publish({ dirty: true, error: storageMessage(conflict()) });
        throw conflict();
      }
      this.current(epoch);
      const receipt = workoutCorrectionReceiptSchema.parse(await this.send(request));
      this.current(epoch);
      if (
        receipt.requestId !== request.requestId ||
        receipt.workoutId !== request.workoutId ||
        receipt.revision <= request.expectedRevision
      )
        throw Error("confirmation");
      this.publish({ confirmation: receipt });
      if (receipt.status === "removed") {
        await this.put({ ...this.document(), pending: { request, issue: "removed" } });
        this.publish({ error: issues.removed });
      } else await this.finishConfirmation(epoch);
      return receipt;
    } catch (error) {
      this.current(epoch);
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      const issue = issueSchema.safeParse(code);
      if (issue.success && this.state.pending && !this.state.confirmation) {
        try {
          await this.put({
            ...this.document(),
            pending: { ...this.state.pending, issue: issue.data },
          });
          this.current(epoch);
        } catch {
          this.current(epoch);
        }
      }
      const message =
        this.state.dirty && this.state.error
          ? this.state.error
          : this.state.confirmation
            ? "El servidor confirmó la corrección, pero falta confirmar la limpieza local. Reintenta sin cambiar el documento."
            : issue.success
              ? issues[issue.data]
              : "No pudimos confirmar la corrección. Conservamos la propuesta y el intento para reintentar.";
      this.publish({ error: message });
      throw Error(message);
    } finally {
      if (epoch === this.epoch && !this.disposed) this.publish({ busy: false });
    }
  }
  dispose() {
    this.disposed = true;
    this.epoch++;
    this.reviewed = null;
  }
}
