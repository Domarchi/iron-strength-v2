import { TrainingController, type TrainingStorage } from "../../../mobile/src/lib/training";
import { NativeWorkoutQueue } from "../../../mobile/src/lib/sync-queue";
import { handoffPending } from "../../../mobile/src/lib/queue-transfer";
import type {
  QueuedWorkoutPayload,
  QueuedSaveReply,
} from "../../../mobile/src/lib/queued-recording";
/** Account-scoped owner of edits, queue transfers, sends and exit reservations. No React/native APIs. */
export class WebTraining {
  readonly controller: TrainingController;
  readonly queue: NativeWorkoutQueue;
  private disposed = false;
  private held = false;
  private work = new Set<Promise<unknown>>();
  private syncing: Promise<boolean> | null = null;
  private state: { reserved: boolean; error: string | null } = { reserved: false, error: null };
  private listeners = new Set<() => void>();
  constructor(
    readonly userId: string,
    storage: TrainingStorage & {
      compareAndSet(key: string, before: string | null, next: string): Promise<void>;
    },
    send: (p: QueuedWorkoutPayload) => Promise<QueuedSaveReply>,
    private own: () => boolean,
    now = () => new Date(),
    uuid = () => globalThis.crypto.randomUUID(),
    private reserveStorage: () => Promise<() => void> = async () => () => {},
  ) {
    const dispatch = (p: QueuedWorkoutPayload) => {
      this.assertOwn();
      return send(p);
    };
    this.controller = new TrainingController(userId, storage, dispatch, now, uuid);
    this.queue = new NativeWorkoutQueue(userId, storage, dispatch, now);
  }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private reserveState(value: boolean) {
    this.held = value;
    this.state = { ...this.state, reserved: value };
    this.listeners.forEach((fn) => fn());
  }
  private assertOwn() {
    if (this.disposed || !this.own())
      throw Error("La cuenta cambió. Conservamos el registro para su cuenta original.");
  }
  private ensure() {
    this.assertOwn();
    const c = this.controller.getSnapshot(),
      q = this.queue.getSnapshot();
    if (this.held || !c.ready || c.blocked || !q.ready || q.blocked || !q.verified)
      throw Error(
        "Recupera primero los registros locales y espera a que termine la operación de cuenta.",
      );
  }
  async restore() {
    this.disposed = false;
    await Promise.all([this.controller.restore(), this.queue.restore()]);
  }
  async recover() {
    this.assertOwn();
    if (this.held || this.syncing || this.work.size)
      throw Error("Espera a que termine la operación.");
    const c = this.controller.getSnapshot();
    if (c.blocked) await this.controller.restore();
    else if (c.dirty) await this.controller.retryStorage();
    await this.queue.restore();
  }
  async perform<T>(fn: (c: TrainingController) => T | Promise<T>): Promise<T> {
    this.ensure();
    const operation = (async () => {
      const result = await fn(this.controller);
      await this.controller.flush();
      return result;
    })();
    this.work.add(operation);
    try {
      return await operation;
    } finally {
      this.work.delete(operation);
    }
  }
  async finish(effort: number | null, note: string | null) {
    return this.perform(async (c) => {
      const result = await c.finish(effort, note, { localOnly: true });
      if (!result) return null;
      await handoffPending(c, this.queue);
      return result.id;
    });
  }
  private async synchronize(manual: boolean) {
    this.assertOwn();
    const c = this.controller.getSnapshot();
    if (c.blocked || c.dirty) await this.controller.flush();
    if (c.active?.draft.status === "pending_save")
      await handoffPending(this.controller, this.queue);
    await this.queue.sync({ manual, canContinue: () => !this.disposed && this.own() });
    return this.queue.getSnapshot().entries.some((e) => e.phase === "pending" && !e.error?.blocked);
  }
  sync(manual = false): Promise<boolean> {
    if (this.syncing) return this.syncing;
    if (this.held || this.disposed || !this.own()) return Promise.resolve(false);
    try {
      this.ensure();
    } catch {
      return Promise.resolve(false);
    }
    this.state = { ...this.state, error: null };
    this.listeners.forEach((fn) => fn());
    const operation = this.synchronize(manual).catch(() => {
      this.state = {
        ...this.state,
        error:
          this.controller.getSnapshot().error ??
          this.queue.getSnapshot().error ??
          "No pudimos confirmar el envío. Conservamos el registro para reintentar.",
      };
      this.listeners.forEach((fn) => fn());
      return false;
    });
    this.syncing = operation;
    void operation
      .finally(() => {
        if (this.syncing === operation) this.syncing = null;
      })
      .catch(() => {});
    return operation;
  }
  async reserve(mode: "inspect" | "sync" | "discard" | "delete") {
    this.assertOwn();
    if (this.held) throw Error("Espera a que termine la operación de cuenta.");
    this.reserveState(true);
    let releaseStorage: (() => void) | undefined;
    const release = () => {
      releaseStorage?.();
      this.reserveState(false);
    };
    try {
      await Promise.all([...this.work]);
      if (this.syncing) await this.syncing;
      this.assertOwn();
      const c = this.controller.getSnapshot(),
        q = this.queue.getSnapshot();
      if (!c.ready || !q.ready) throw Error("Espera a recuperar los registros locales.");
      if (!c.blocked) await this.controller.flush();
      if (mode !== "delete" && (c.blocked || q.blocked))
        throw Error(
          "Conservamos un formato local que requiere una versión compatible. No lo eliminamos al salir.",
        );
      if (mode === "sync") await this.synchronize(true);
      if (mode === "discard") {
        if (this.controller.getSnapshot().active) await this.controller.discard();
        for (const entry of this.queue.getSnapshot().entries)
          await this.queue.discard(entry.payload.id);
      }
      const after = this.controller.getSnapshot(),
        pending = this.queue.getSnapshot().entries.some((e) => e.phase === "pending");
      if (mode !== "delete" && !after.active && !pending) {
        await this.controller.clearForLogout();
        await this.queue.clearForLogout();
      }
      releaseStorage = await this.reserveStorage();
      this.assertOwn();
      return release;
    } catch (error) {
      release();
      throw error;
    }
  }
  dispose() {
    this.disposed = true;
    this.controller.dispose();
    this.queue.dispose();
    this.listeners.clear();
  }
}
