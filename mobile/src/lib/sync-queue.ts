import { z } from "zod";
import { nativeWorkoutPayloadSchema, isRecordingPayload } from "./personal-training";
import {
  queuedWorkoutPayloadSchema,
  queuedReceiptSchema,
  isTypedRecording,
  type QueuedWorkoutPayload,
  type QueuedSaveReply,
} from "./queued-recording";
import type { TrainingStorage } from "./training";
export type QueueStorage = TrainingStorage & {
  compareAndSet(key: string, before: string | null, next: string): Promise<void>;
};
const failureSchema = z
  .object({ code: z.string().max(64), message: z.string().max(300), blocked: z.boolean() })
  .strict();
const entryBase = z
  .object({
    title: z.string().min(1).max(140),
    payload: queuedWorkoutPayloadSchema,
    queuedAt: z.iso.datetime(),
    phase: z.enum(["pending", "confirmed"]),
    confirmedAt: z.iso.datetime().nullable(),
    error: failureSchema.nullable(),
  })
  .strict();
const validEntry = (e: { phase: "pending" | "confirmed"; confirmedAt: string | null }) =>
  (e.phase === "confirmed") === (e.confirmedAt !== null);
const entrySchema = entryBase.refine(validEntry);
const oldEntrySchema = entryBase.extend({ payload: nativeWorkoutPayloadSchema }).refine(validEntry);
export type QueueEntry = z.infer<typeof entrySchema>;
const validRecord = (r: {
  entries: { payload: { id: string }; phase: "pending" | "confirmed" }[];
}) =>
  new Set(r.entries.map((e) => e.payload.id.toLowerCase())).size === r.entries.length &&
  r.entries.filter((e) => e.phase === "pending").length <= 50 &&
  r.entries.filter((e) => e.phase === "confirmed").length <= 20;
const recordSchema = z
  .object({ version: z.literal(1), userId: z.uuid(), entries: z.array(oldEntrySchema).max(70) })
  .strict()
  .refine(validRecord);
const legacyRecordSchema = recordSchema.refine((r) =>
  r.entries.every((e) => !isRecordingPayload(e.payload)),
);
const recordingRecordSchema = z
  .object({
    ...recordSchema.shape,
    version: z.literal(2),
    previousFormat: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (r) => recordSchema.safeParse({ version: 1, userId: r.userId, entries: r.entries }).success,
  )
  .refine((r) => {
    if (!r.previousFormat) return true;
    try {
      const old = legacyRecordSchema.safeParse(JSON.parse(r.previousFormat));
      return old.success && old.data.userId === r.userId;
    } catch {
      return false;
    }
  });
const previousRecordSchema = z.union([legacyRecordSchema, recordingRecordSchema]);
const typedRecordSchema = z
  .object({
    version: z.literal(3),
    userId: z.uuid(),
    entries: z.array(entrySchema).max(70),
    previousFormat: z.string().min(1).optional(),
  })
  .strict()
  .refine(validRecord)
  .refine((r) => {
    if (!r.previousFormat) return true;
    try {
      const previous = previousRecordSchema.safeParse(JSON.parse(r.previousFormat));
      return previous.success && previous.data.userId === r.userId;
    } catch {
      return false;
    }
  });
const queueRecordSchema = z.union([previousRecordSchema, typedRecordSchema]);
export const nativeSyncKey = (userId: string) => `is:native-sync:v1:${userId}`;
export const samePayload = (a: QueuedWorkoutPayload, b: QueuedWorkoutPayload) =>
  JSON.stringify(queuedWorkoutPayloadSchema.parse(a)) ===
  JSON.stringify(queuedWorkoutPayloadSchema.parse(b));
type State = {
  ready: boolean;
  busy: boolean;
  verified: boolean;
  blocked: boolean;
  entries: QueueEntry[];
  error: string | null;
};
function failure(error: unknown): z.infer<typeof failureSchema> {
  const e = error as { code?: unknown; status?: unknown; message?: unknown } | null,
    code = typeof e?.code === "string" ? e.code.slice(0, 64) : "unavailable",
    status = typeof e?.status === "number" ? e.status : 0;
  return {
    code,
    message:
      typeof e?.code === "string" && typeof e.message === "string"
        ? e.message.slice(0, 300)
        : "No pudimos confirmar el envío. Conservamos el registro para reintentar.",
    blocked:
      code === "identity" ||
      code === "version" ||
      (status >= 400 && status < 500 && ![401, 408, 429].includes(status)),
  };
}
function bounded(entries: QueueEntry[]) {
  const confirmed = new Set(
    entries
      .filter((e) => e.phase === "confirmed")
      .reverse()
      .sort((a, b) => b.confirmedAt!.localeCompare(a.confirmedAt!))
      .slice(0, 20)
      .map((e) => e.payload.id),
  );
  return entries.filter((e) => e.phase === "pending" || confirmed.has(e.payload.id));
}
export class NativeWorkoutQueue {
  private state: State = {
    ready: false,
    busy: false,
    verified: false,
    blocked: false,
    entries: [],
    error: null,
  };
  private raw: string | null = null;
  private formatVersion: 1 | 2 | 3 = 1;
  private previousFormat: string | null = null;
  private disposed = false;
  private epoch = 0;
  private listeners = new Set<() => void>();
  private syncing: Promise<{ confirmed: number; failed: number } | null> | null = null;
  readonly key: string;
  constructor(
    readonly userId: string,
    private storage: QueueStorage,
    private send: (payload: QueuedWorkoutPayload) => Promise<QueuedSaveReply>,
    private now = () => new Date(),
  ) {
    if (!z.uuid().safeParse(userId).success) throw Error("Identidad de cola inválida.");
    this.key = nativeSyncKey(userId);
  }
  getSnapshot = () => this.state;
  isLive = () => !this.disposed;
  generation = () => this.epoch;
  isCurrent = (epoch: number) => !this.disposed && epoch === this.epoch;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(next: Partial<State>) {
    this.state = { ...this.state, ...next };
    if (!this.disposed) this.listeners.forEach((fn) => fn());
  }
  private ensure() {
    if (
      this.disposed ||
      !this.state.ready ||
      !this.state.verified ||
      this.state.blocked ||
      this.state.busy
    )
      throw Error("Espera o comprueba la cola local antes de continuar.");
  }
  async restore() {
    if (this.state.busy && !this.disposed) return;
    this.disposed = false;
    const epoch = ++this.epoch;
    this.publish({ busy: true, error: null });
    try {
      const raw = await this.storage.get(this.key);
      if (this.disposed || epoch !== this.epoch) return;
      const record =
        raw === null
          ? { version: 1 as const, userId: this.userId, entries: [] }
          : queueRecordSchema.parse(JSON.parse(raw));
      if (record.userId !== this.userId) throw Error("Cuenta distinta");
      this.raw = raw;
      this.formatVersion = record.version;
      this.previousFormat = record.version !== 1 ? (record.previousFormat ?? null) : null;
      this.publish({ entries: record.entries, verified: true, blocked: false, error: null });
    } catch {
      if (!this.disposed && epoch === this.epoch)
        this.publish({
          verified: false,
          blocked: true,
          error:
            "No pudimos verificar tu cola local. Se conserva; comprueba el almacenamiento o usa una versión compatible.",
        });
    } finally {
      if (epoch === this.epoch) this.publish({ ready: true, busy: false });
    }
  }
  private async commit(entries: QueueEntry[]) {
    const epoch = this.epoch;
    if (this.formatVersion !== 3 && entries.some((e) => isTypedRecording(e.payload))) {
      this.previousFormat = this.raw;
      this.formatVersion = 3;
    } else if (
      this.formatVersion === 1 &&
      entries.some((e) => !isTypedRecording(e.payload) && isRecordingPayload(e.payload))
    ) {
      this.previousFormat = this.raw;
      this.formatVersion = 2;
    }
    const record = queueRecordSchema.parse({
        version: this.formatVersion,
        userId: this.userId,
        entries: bounded(entries),
        ...(entries.length && this.previousFormat ? { previousFormat: this.previousFormat } : {}),
      }),
      encoded = JSON.stringify(record);
    try {
      // The captured write completes on its original key even if auth unmounts the provider.
      await this.storage.compareAndSet(this.key, this.raw, encoded);
      if ((await this.storage.get(this.key)) !== encoded) throw Error("readback");
      if (!this.isCurrent(epoch)) return;
      this.raw = encoded;
      if (!record.entries.length) this.previousFormat = null;
      this.publish({ entries: record.entries, verified: true, blocked: false, error: null });
    } catch {
      const message =
        "No pudimos confirmar la cola en este dispositivo. Se conservan los registros; comprueba el almacenamiento y los cambios de otra ventana.";
      if (this.isCurrent(epoch)) this.publish({ verified: false, blocked: true, error: message });
      throw Error(message);
    }
  }
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    this.ensure();
    const epoch = this.epoch;
    this.publish({ busy: true, error: null });
    try {
      return await operation();
    } catch (e) {
      if (!this.disposed && epoch === this.epoch)
        this.publish({
          error: e instanceof Error ? e.message : "No pudimos completar la operación.",
        });
      throw e;
    } finally {
      if (epoch === this.epoch) this.publish({ busy: false });
    }
  }
  async enqueue(input: { userId: string; title: string; payload: QueuedWorkoutPayload }) {
    return this.run(async () => {
      if (input.userId !== this.userId)
        throw Error("La cuenta del registro no corresponde a esta cola.");
      const payload = queuedWorkoutPayloadSchema.parse(input.payload),
        existing = this.state.entries.find(
          (e) => e.payload.id.toLowerCase() === payload.id.toLowerCase(),
        );
      if (existing) {
        if (!samePayload(existing.payload, payload)) {
          const error = {
            code: "conflict",
            message:
              "Este identificador ya tiene otro contenido. Conservamos ambas fuentes; revisa el registro antes de enviarlo.",
            blocked: true,
          };
          await this.commit(this.state.entries.map((e) => (e === existing ? { ...e, error } : e)));
          throw Error(error.message);
        }
        await this.commit(this.state.entries);
        return existing;
      }
      if (this.state.entries.filter((e) => e.phase === "pending").length >= 50)
        throw Error(
          "Hay 50 registros pendientes. Sincroniza o descarta uno explícitamente; tu cierre original se conserva.",
        );
      const entry = entrySchema.parse({
        title: input.title,
        payload,
        queuedAt: this.now().toISOString(),
        phase: "pending",
        confirmedAt: null,
        error: null,
      });
      await this.commit([...this.state.entries, entry]);
      return entry;
    });
  }
  sync(options: { manual?: boolean; canContinue?: () => boolean } = {}) {
    if (this.syncing) return this.syncing;
    const epoch = this.epoch;
    const operation = this.run(async () => {
      let confirmed = 0,
        failed = 0;
      const pending = this.state.entries.filter(
        (e) => e.phase === "pending" && (options.manual || !e.error?.blocked),
      );
      if (pending.length) await this.commit(this.state.entries);
      for (const entry of pending) {
        if (this.disposed || epoch !== this.epoch) return null;
        if (options.canContinue?.() === false) break;
        let error: z.infer<typeof failureSchema> | null = null;
        try {
          const reply = queuedReceiptSchema(entry.payload).safeParse(
            await this.send(entry.payload),
          );
          if (!reply.success)
            error = {
              code: "version",
              message:
                "La respuesta requiere una versión compatible. Conservamos este registro para revisión.",
              blocked: true,
            };
          else if (reply.data.workoutId !== entry.payload.id)
            error = {
              code: "identity",
              message:
                "El servidor confirmó otro registro. Conservamos este entrenamiento para revisión.",
              blocked: true,
            };
        } catch (e) {
          error = failure(e);
        }
        if (this.disposed || epoch !== this.epoch) return null;
        if (error) {
          failed++;
          await this.commit(
            this.state.entries.map((e) =>
              e.payload.id === entry.payload.id ? { ...e, error } : e,
            ),
          );
          if (!error.blocked) break;
        } else {
          await this.commit(
            this.state.entries.map((e) =>
              e.payload.id === entry.payload.id
                ? { ...e, phase: "confirmed", confirmedAt: this.now().toISOString(), error: null }
                : e,
            ),
          );
          confirmed++;
        }
      }
      return { confirmed, failed };
    });
    this.syncing = operation;
    void operation
      .finally(() => {
        if (this.syncing === operation) this.syncing = null;
      })
      .catch(() => {});
    return operation;
  }
  async discard(id: string) {
    await this.run(() => this.commit(this.state.entries.filter((e) => e.payload.id !== id)));
  }
  async flush() {
    if (this.state.busy) throw Error("Espera a que termine la sincronización o el guardado local.");
    if (!this.state.verified)
      throw Error(this.state.error ?? "Comprueba primero la cola guardada.");
  }
  async clearForLogout() {
    if (this.state.blocked) return; // An unknown format is preserved, never removed on logout.
    await this.flush();
    if (this.state.entries.some((e) => e.phase === "pending"))
      throw Error("Sincroniza o descarta explícitamente los registros pendientes antes de salir.");
    await this.run(() => this.commit([]));
  }
  dispose() {
    this.disposed = true;
    this.epoch++;
    this.listeners.clear();
  }
}
