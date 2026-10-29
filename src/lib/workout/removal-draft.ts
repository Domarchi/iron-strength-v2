import { z } from "zod";
import { isWorkoutEditable } from "../../domain/edit-window";
import {
  workoutRemovalSchema,
  workoutRemovalSnapshotSchema,
  workoutRemovalReceiptSchema,
  type WorkoutRemoval,
  type WorkoutRemovalSnapshot,
  type WorkoutRemovalReceipt,
} from "../mobile/workout-removal-contracts";
import type { CorrectionStorage } from "./correction-draft";
const issueSchema = z.enum(["conflict", "not_found", "invalid_input", "forbidden", "edit_locked"]);
type Issue = z.infer<typeof issueSchema>;
const messages: Record<Issue, string> = {
  conflict: "El entrenamiento cambió. Revisa su versión actual antes de eliminarlo.",
  not_found: "El entrenamiento ya no está disponible. Este intento no confirma quién lo eliminó.",
  invalid_input: "El servidor rechazó la eliminación. Conservamos el intento para revisarlo.",
  forbidden: "Tu cuenta no puede eliminar este entrenamiento. Conservamos el intento.",
  edit_locked: "Terminó el plazo de siete días para eliminar este entrenamiento.",
};
export function workoutRemovalIssueMessage(issue: Issue | null) {
  return issue === null ? null : messages[issue];
}
export const workoutRemovalDraftSchema = z
  .object({
    version: z.literal(1),
    userId: z.uuid(),
    pending: z
      .object({
        review: workoutRemovalSnapshotSchema,
        request: workoutRemovalSchema,
        issue: issueSchema.nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const p = doc.pending;
    if (
      p &&
      (p.review.userId !== doc.userId ||
        p.review.workout.id !== p.request.workoutId ||
        p.review.workout.revision !== p.request.expectedRevision)
    )
      ctx.addIssue({
        code: "custom",
        message: "El intento no corresponde a su cuenta o revisión.",
      });
  });
type Document = z.infer<typeof workoutRemovalDraftSchema>;
type State = Document & {
  ready: boolean;
  busy: boolean;
  dirty: boolean;
  blocked: boolean;
  paused: boolean;
  error: string | null;
  confirmation: WorkoutRemovalReceipt | null;
};
type Ports = {
  send(input: WorkoutRemoval): Promise<unknown>;
  uuid(): string;
  reserve(workoutId: string): Promise<() => void>;
  onRemoved(workoutId: string): Promise<void>;
};
const changed = () =>
  Object.assign(Error("El intento local cambió en otra ventana."), { reason: "conflict" });
const storageMessage = (error: unknown) =>
  error && typeof error === "object" && "reason" in error && error.reason === "conflict"
    ? "La eliminación local cambió en otra ventana. Conservamos ambas versiones sin sobrescribirlas."
    : "No pudimos confirmar el guardado en este dispositivo. Conservamos el intento; revisa el almacenamiento y reintenta.";
export function removalDraftKey(userId: string) {
  return `is:workout-removal:v1:${z.uuid().parse(userId).toLowerCase()}`;
}
/** A frozen, explicitly confirmed intent. Adapters provide CAS and account/correction reservations. */
export class WorkoutRemovalController {
  readonly key: string;
  private state: State;
  private raw: string | null = null;
  private attemptedRaw: string | undefined;
  private tail: Promise<void> = Promise.resolve();
  private epoch = 0;
  private reservation = 0;
  private disposed = false;
  private listeners = new Set<() => void>();
  constructor(
    private userId: string,
    private storage: CorrectionStorage,
    private ports: Ports,
  ) {
    this.userId = z.uuid().parse(userId).toLowerCase();
    this.key = removalDraftKey(this.userId);
    this.state = {
      ...this.empty(),
      ready: false,
      busy: false,
      dirty: false,
      blocked: false,
      paused: false,
      error: null,
      confirmation: null,
    };
  }
  private empty(): Document {
    return { version: 1, userId: this.userId, pending: null };
  }
  private document(): Document {
    return { version: 1, userId: this.userId, pending: this.state.pending };
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
      throw Error("Espera o recupera la eliminación local antes de continuar.");
  }
  async restore() {
    if (this.state.ready && (this.state.dirty || this.state.pending))
      throw Error("Confirma el reemplazo del intento en memoria antes de releer.");
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
        doc = raw === null ? this.empty() : workoutRemovalDraftSchema.parse(JSON.parse(raw));
      this.current(epoch);
      if (doc.userId !== this.userId) throw Error("identity");
      this.raw = raw;
      this.attemptedRaw = undefined;
      this.publish({
        ...doc,
        ready: true,
        dirty: false,
        blocked: false,
        error: null,
        confirmation: null,
      });
    } catch {
      if (epoch === this.epoch && !this.disposed)
        this.publish({
          ready: true,
          blocked: true,
          error:
            "No pudimos recuperar la eliminación local. Conservamos el contenido; reintenta con una versión compatible.",
        });
    } finally {
      if (epoch === this.epoch && !this.disposed) this.publish({ busy: false });
    }
  }
  async reloadLocal(discardMemory = false) {
    if (this.state.busy || this.state.paused || this.disposed)
      throw Error("Espera a que termine la operación actual.");
    if ((this.state.pending || this.state.dirty) && !discardMemory)
      throw Error("Confirma el reemplazo del intento en memoria antes de releer.");
    await this.loadStored();
  }
  private async write(doc: Document, epoch: number) {
    const encoded = JSON.stringify(workoutRemovalDraftSchema.parse(doc));
    this.publish({ dirty: true });
    const operation = async () => {
      this.current(epoch);
      const raw = await this.storage.get(this.key);
      this.current(epoch);
      if (raw !== this.raw && raw !== this.attemptedRaw) throw changed();
      this.attemptedRaw = encoded;
      await this.storage.compareAndSet(this.key, raw, encoded);
      if ((await this.storage.get(this.key)) !== encoded) throw Error("verification");
      this.current(epoch);
      this.raw = encoded;
      this.attemptedRaw = undefined;
    };
    const next = this.tail.then(operation, operation);
    this.tail = next.then(
      () => {},
      () => {},
    );
    try {
      await next;
      this.current(epoch);
      this.publish({ dirty: false, error: null });
    } catch (error) {
      this.current(epoch);
      const message = storageMessage(error);
      this.publish({ dirty: true, error: message });
      throw Error(message);
    }
  }
  private async put(doc: Document, epoch: number) {
    this.current(epoch);
    const parsed = workoutRemovalDraftSchema.parse(doc);
    this.publish(parsed);
    await this.write(parsed, epoch);
  }
  async flush() {
    await this.tail;
    if (this.state.dirty)
      throw Error(this.state.error ?? "Queda un intento sin proteger en este dispositivo.");
  }
  pauseWrites() {
    if (!this.state.ready || this.state.busy || this.state.paused || this.disposed)
      throw Error("Espera a que termine la lectura o eliminación del entrenamiento.");
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
    if (!this.state.paused || !this.state.ready || this.state.blocked || this.state.pending)
      throw Error("Resuelve la eliminación pendiente antes de salir.");
    await this.flush();
    this.current(epoch);
    await this.write(this.empty(), epoch);
    this.current(epoch);
    this.publish({ ...this.empty(), confirmation: null });
  }
  async discard(confirmUncertain = false) {
    this.ensure();
    if (this.state.confirmation)
      throw Error("El servidor ya confirmó la eliminación. Completa la limpieza local.");
    if (this.state.pending && !confirmUncertain)
      throw Error(
        "Confirma que descartar el intento local no restaura un entrenamiento ya eliminado en el servidor.",
      );
    const epoch = this.epoch;
    this.publish({ busy: true });
    try {
      await this.write(this.empty(), epoch);
      this.current(epoch);
      this.publish({ ...this.empty(), confirmation: null });
    } finally {
      if (epoch === this.epoch && !this.disposed) this.publish({ busy: false });
    }
  }
  private review(value: WorkoutRemovalSnapshot) {
    const review = workoutRemovalSnapshotSchema.parse(value);
    if (review.userId !== this.userId) throw Error("El resultado no corresponde a esta cuenta.");
    if (!isWorkoutEditable(review.workout.performedOn, review.today))
      throw Error(messages.edit_locked);
    return review;
  }
  async acceptLatest(value: WorkoutRemovalSnapshot) {
    this.ensure();
    const pending = this.state.pending,
      review = this.review(value);
    if (
      pending?.issue !== "conflict" ||
      review.workout.id !== pending.request.workoutId ||
      review.workout.revision <= pending.request.expectedRevision
    )
      throw Error("Revisa un conflicto confirmado antes de cambiar la revisión.");
    const epoch = this.epoch;
    this.publish({ busy: true });
    try {
      await this.write(this.empty(), epoch);
      this.current(epoch);
      this.publish({ ...this.empty(), confirmation: null });
    } finally {
      if (epoch === this.epoch && !this.disposed) this.publish({ busy: false });
    }
  }
  async confirm(value: WorkoutRemovalSnapshot) {
    this.ensure();
    if (this.state.pending || this.state.dirty)
      throw Error("Resuelve el intento pendiente antes de confirmar otra eliminación.");
    return this.perform(this.review(value));
  }
  async retry() {
    this.ensure();
    if (!this.state.pending && !this.state.confirmation)
      throw Error("No hay una eliminación pendiente.");
    return this.perform();
  }
  private async finish(epoch: number) {
    const receipt = this.state.confirmation;
    if (!receipt) throw Error("Falta confirmación del servidor.");
    await this.ports.onRemoved(receipt.workoutId);
    this.current(epoch);
    await this.write(this.empty(), epoch);
    this.current(epoch);
    this.publish({ ...this.empty(), confirmation: receipt });
  }
  async retryStorage() {
    this.ensure();
    if (this.state.confirmation) {
      await this.perform();
      return;
    }
    const epoch = this.epoch;
    this.publish({ busy: true });
    try {
      await this.write(this.document(), epoch);
    } finally {
      if (epoch === this.epoch && !this.disposed) this.publish({ busy: false });
    }
  }
  private async perform(review?: WorkoutRemovalSnapshot): Promise<WorkoutRemovalReceipt> {
    const epoch = this.epoch;
    if (this.state.pending?.issue && !this.state.confirmation)
      throw Error(messages[this.state.pending.issue]);
    this.publish({ busy: true, error: null });
    let release: (() => void) | undefined;
    try {
      const workoutId =
        review?.workout.id ??
        this.state.pending?.request.workoutId ??
        this.state.confirmation?.workoutId;
      if (!workoutId) throw Error("Falta el entrenamiento revisado.");
      release = await this.ports.reserve(workoutId);
      this.current(epoch);
      if (this.state.confirmation) {
        const receipt = this.state.confirmation;
        await this.finish(epoch);
        return receipt;
      }
      await this.flush();
      this.current(epoch);
      let request = this.state.pending?.request;
      if (!request) {
        if (!review) throw Error("Falta el entrenamiento revisado.");
        request = workoutRemovalSchema.parse({
          version: 1,
          requestId: this.ports.uuid(),
          workoutId,
          expectedRevision: review.workout.revision,
        });
        await this.put({ ...this.empty(), pending: { review, request, issue: null } }, epoch);
      }
      this.current(epoch);
      if ((await this.storage.get(this.key)) !== this.raw) {
        this.publish({ dirty: true, error: storageMessage(changed()) });
        throw changed();
      }
      this.current(epoch);
      const receipt = workoutRemovalReceiptSchema.parse(await this.ports.send(request));
      this.current(epoch);
      if (
        receipt.requestId !== request.requestId ||
        receipt.workoutId !== request.workoutId ||
        receipt.revision <= request.expectedRevision
      )
        throw Error("confirmation");
      this.publish({ confirmation: receipt });
      await this.finish(epoch);
      return receipt;
    } catch (error) {
      this.current(epoch);
      const code = error && typeof error === "object" && "code" in error ? error.code : null,
        issue = issueSchema.safeParse(code);
      if (issue.success && this.state.pending && !this.state.confirmation) {
        try {
          await this.put(
            { ...this.document(), pending: { ...this.state.pending, issue: issue.data } },
            epoch,
          );
        } catch {
          this.current(epoch);
        }
      }
      const message = this.state.confirmation
        ? "El servidor confirmó la eliminación, pero falta confirmar la limpieza local. Reintenta sin cambiar el intento."
        : this.state.dirty && this.state.error
          ? this.state.error
          : issue.success
            ? messages[issue.data]
            : !release && error instanceof Error
              ? error.message
              : "No pudimos confirmar la eliminación. Conservamos el intento para reintentar sin duplicarlo.";
      this.publish({ error: message });
      throw Error(message);
    } finally {
      release?.();
      if (epoch === this.epoch && !this.disposed) this.publish({ busy: false });
    }
  }
  dispose() {
    this.disposed = true;
    this.epoch++;
  }
}
