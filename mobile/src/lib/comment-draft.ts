import { z } from "zod";
import type { TrainingStorage } from "./training";
const schema = z
  .object({
    version: z.literal(1),
    userId: z.uuid(),
    workoutId: z.uuid(),
    id: z.uuid(),
    body: z.string().max(500),
    phase: z.enum(["editing", "pending"]),
  })
  .strict()
  .refine((r) => r.phase !== "pending" || r.body.trim().length > 0);
export type CommentDraft = z.infer<typeof schema>;
export type CommentAttempt = { workoutId: string; id: string; body: string };
type State = {
  ready: boolean;
  blocked: boolean;
  busy: boolean;
  dirty: boolean;
  record: CommentDraft | null;
  error: string | null;
  rejection: "removed" | "conflict" | null;
};
export class CommentDraftController {
  private state: State = {
    ready: false,
    blocked: false,
    busy: false,
    dirty: false,
    record: null,
    error: null,
    rejection: null,
  };
  private listeners = new Set<() => void>();
  private tail: Promise<void> = Promise.resolve();
  private raw: string | null = null;
  private attempt: string | null | undefined;
  private revision = 0;
  private epoch = 0;
  private key: string;
  constructor(
    private userId: string,
    private storage: TrainingStorage,
    private publishMessage: (input: CommentAttempt) => Promise<void>,
    private uuid: () => string,
  ) {
    this.key = `is:native-comment:v1:${userId}`;
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
  private serialize<T>(fn: () => Promise<T>) {
    const next = this.tail.then(fn, fn);
    this.tail = next.then(
      () => {},
      () => {},
    );
    return next;
  }
  async restore() {
    const epoch = ++this.epoch;
    try {
      const raw = await this.storage.get(this.key);
      if (epoch !== this.epoch) return;
      const record = raw === null ? null : schema.parse(JSON.parse(raw));
      if (record && record.userId !== this.userId) throw Error("Identidad distinta");
      this.raw = raw;
      this.attempt = undefined;
      this.publish({
        ready: true,
        blocked: false,
        record,
        error: null,
        dirty: false,
        rejection: null,
      });
    } catch {
      if (epoch === this.epoch)
        this.publish({
          ready: true,
          blocked: true,
          error:
            "No pudimos recuperar tu comentario local. Se conserva; reintenta con una versión compatible.",
        });
    }
  }
  private ensure() {
    if (!this.state.ready || this.state.blocked || this.state.busy)
      throw Error("Espera o recupera el comentario local antes de continuar.");
  }
  private async persist(record = this.state.record) {
    const rev = ++this.revision,
      encoded = record ? JSON.stringify(record) : null;
    this.publish({ dirty: true });
    try {
      await this.serialize(async () => {
        const current = await this.storage.get(this.key);
        if (current !== this.raw && current !== this.attempt)
          throw Error(
            "El comentario cambió en otra ventana. Tu texto está en memoria; cópialo antes de volver a abrir.",
          );
        this.attempt = encoded;
        if (encoded === null) await this.storage.remove(this.key);
        else await this.storage.set(this.key, encoded);
        if ((await this.storage.get(this.key)) !== encoded)
          throw Error("No pudimos verificar el guardado local.");
        this.raw = encoded;
        this.attempt = undefined;
      });
      if (rev === this.revision) this.publish({ dirty: false, error: null });
    } catch (e) {
      const message =
        e instanceof Error && e.message.startsWith("El comentario cambió")
          ? e.message
          : "No pudimos guardar el comentario en este dispositivo. Revisa el espacio disponible y reintenta.";
      if (rev === this.revision)
        this.publish({
          dirty: true,
          error: message,
        });
      throw Error(message);
    }
  }
  async flush() {
    await this.tail;
    if (this.state.dirty)
      throw Error(this.state.error ?? "El comentario tiene cambios sin guardar.");
  }
  async retryStorage() {
    this.ensure();
    await this.persist();
  }
  async edit(workoutId: string, body: string) {
    this.ensure();
    if (!z.uuid().safeParse(workoutId).success || body.length > 500)
      throw Error("Escribe hasta 500 caracteres en un entrenamiento válido.");
    const previous = this.state.record;
    if (previous && (previous.workoutId !== workoutId || previous.phase === "pending"))
      throw Error("Retoma o descarta el comentario pendiente antes de escribir otro.");
    const record =
      body === ""
        ? null
        : {
            version: 1 as const,
            userId: this.userId,
            workoutId,
            id: previous?.id ?? this.uuid(),
            body,
            phase: "editing" as const,
          };
    this.publish({ record });
    await this.persist(record);
  }
  async send() {
    this.ensure();
    if (this.state.rejection)
      throw Error(
        this.state.error ?? "Revisa o descarta este intento antes de empezar un comentario nuevo.",
      );
    const record = this.state.record;
    if (!record || !record.body.trim())
      throw Error("Escribe un comentario de hasta 500 caracteres.");
    const epoch = this.epoch;
    this.publish({ busy: true, error: null });
    try {
      await this.tail;
      const frozen = { ...record, body: record.body.trim(), phase: "pending" as const };
      this.publish({ record: frozen });
      await this.persist(frozen);
      await this.publishMessage({ workoutId: frozen.workoutId, id: frozen.id, body: frozen.body });
      if (epoch !== this.epoch) return;
      await this.persist(null);
      this.publish({ record: null, error: null });
    } catch (e) {
      const code = e instanceof Error && "code" in e ? e.code : null;
      this.publish({
        rejection: code === "removed" || code === "conflict" ? code : null,
        error:
          e instanceof Error
            ? e.message
            : "No pudimos confirmar el envío. Conservamos tu mensaje para reintentar.",
      });
      throw e;
    } finally {
      this.publish({ busy: false });
    }
  }
  async discard() {
    this.ensure();
    this.publish({ busy: true });
    try {
      await this.persist(null);
      this.publish({ record: null, error: null, rejection: null });
    } finally {
      this.publish({ busy: false });
    }
  }
  async clearForLogout() {
    this.ensure();
    await this.flush();
    if (this.state.record) throw Error("Envía o descarta el comentario pendiente antes de salir.");
    await this.persist(null);
  }
  dispose() {
    this.epoch++;
    this.listeners.clear();
  }
}
