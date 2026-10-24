import { z } from "zod";
import { workoutPayloadSchema } from "../../../src/lib/workout/payload";
import { mobileRoutineSchema, type MobileRoutine } from "../../../src/lib/mobile/contracts";
import { workoutDraftSchema, type WorkoutDraft } from "../../../src/lib/workout/draft";
import {
  buildPayload,
  completeSet,
  createDraft,
  finishDraft,
  type WorkoutPayload,
} from "../../../src/lib/workout/runner-state";
import { finishedSupersetRound, nextSupersetSet } from "../../../src/domain/superset-rounds";
import { restAfterSet } from "../../../src/domain/rest-timer";
export interface TrainingStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
export type SaveReply = {
  version: 1;
  ok: true;
  status: "created" | "duplicate";
  workoutId: string;
};
const activeSchema = z.object({
  mode: z.enum(["demo", "real"]),
  routine: mobileRoutineSchema,
  draft: workoutDraftSchema,
  activeIndex: z.number().int().min(0).max(14),
  payload: workoutPayloadSchema.optional(),
  review: z.object({ effort: z.string().max(2), note: z.string().max(500) }).optional(),
});
export type ActiveTraining = z.infer<typeof activeSchema>;
export type DemoResult = { id: string; title: string; payload: WorkoutPayload };
const envelopeSchema = z.object({
  version: z.literal(1),
  userId: z.uuid(),
  active: activeSchema.nullable(),
  demos: z
    .array(z.object({ id: z.uuid(), title: z.string(), payload: workoutPayloadSchema }))
    .max(20),
});
export type TrainingState = {
  ready: boolean;
  active: ActiveTraining | null;
  demos: DemoResult[];
  dirty: boolean;
  busy: boolean;
  error: string | null;
  blocked: boolean;
};
const initial = (): TrainingState => ({
  ready: false,
  active: null,
  demos: [],
  dirty: false,
  busy: false,
  error: null,
  blocked: false,
});
export class TrainingController {
  private state = initial();
  private listeners = new Set<() => void>();
  private tail: Promise<void> = Promise.resolve();
  private raw: string | null = null;
  private attempt: string | null = null;
  private revision = 0;
  private disposed = false;
  private epoch = 0;
  private readonly key: string;
  constructor(
    private userId: string,
    private storage: TrainingStorage,
    private send: (payload: WorkoutPayload) => Promise<SaveReply>,
    private now = () => new Date(),
    private uuid: () => string = () => globalThis.crypto.randomUUID(),
  ) {
    this.key = `is:native-training:v1:${userId}`;
  }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(p: Partial<TrainingState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...p };
    this.listeners.forEach((fn) => fn());
  }
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.tail.then(fn, fn);
    this.tail = p.then(
      () => {},
      () => {},
    );
    return p;
  }
  async restore() {
    this.disposed = false;
    const epoch = ++this.epoch;
    try {
      const raw = await this.storage.get(this.key);
      if (this.disposed || epoch !== this.epoch) return;
      this.raw = raw;
      if (raw === null) {
        this.publish({ ...initial(), ready: true });
        return;
      }
      const parsed = envelopeSchema.safeParse(JSON.parse(raw));
      if (
        !parsed.success ||
        parsed.data.userId !== this.userId ||
        (parsed.data.active && parsed.data.active.draft.userId !== this.userId)
      )
        throw Error("Formato no compatible");
      const data = parsed.data;
      // El payload de una demo también se reconstruye/valida con las reglas compartidas al crearlo.
      this.publish({
        ready: true,
        busy: false,
        dirty: false,
        active: data.active,
        demos: data.demos,
        error: null,
        blocked: false,
      });
    } catch {
      if (this.disposed || epoch !== this.epoch) return;
      this.publish({
        ready: true,
        blocked: true,
        error:
          "No pudimos recuperar el registro local. Se conserva; reintenta antes de comenzar otro.",
      });
    }
  }
  private ensure() {
    if (!this.state.ready || this.state.blocked || this.disposed)
      throw Error("Recupera primero el registro local.");
  }
  private persist() {
    const rev = ++this.revision;
    const encoded = JSON.stringify({
      version: 1,
      userId: this.userId,
      active: this.state.active,
      demos: this.state.demos,
    });
    this.publish({ dirty: true });
    const operation = this.serialize(async () => {
      if (this.disposed) return;
      const current = await this.storage.get(this.key);
      if (current !== this.raw && current !== this.attempt)
        throw Error(
          "El registro cambió en otra ventana. Conservamos tus datos; vuelve a abrir la app para revisar.",
        );
      this.attempt = encoded;
      await this.storage.set(this.key, encoded);
      if ((await this.storage.get(this.key)) !== encoded)
        throw Error("No se pudo verificar el almacenamiento.");
      this.raw = encoded;
      this.attempt = null;
      if (rev === this.revision) this.publish({ dirty: false, error: null });
    });
    const p = operation.catch((e: unknown) => {
      throw new Error(
        e instanceof Error && e.message.startsWith("El registro cambió")
          ? e.message
          : "No pudimos guardar en este dispositivo. Revisa el espacio disponible y reintenta.",
      );
    });
    void p.catch((e) => {
      if (rev === this.revision)
        this.publish({
          dirty: true,
          error: e instanceof Error ? e.message : "No pudimos guardar en este dispositivo.",
        });
    });
    return p;
  }
  async flush() {
    await this.tail;
    if (this.state.dirty)
      throw Error(this.state.error ?? "Hay cambios sin guardar en este dispositivo.");
  }
  async retryStorage() {
    this.ensure();
    await this.persist();
  }
  async start(routine: MobileRoutine, mode: "demo" | "real") {
    this.ensure();
    if (this.state.active)
      throw Error("Ya tienes un entrenamiento. Retómalo o descártalo primero.");
    const draft = createDraft({
      workoutId: this.uuid(),
      userId: this.userId,
      plannedSession: routine.session,
      exercises: routine.exercises.map((e) => ({
        ...e,
        lastWeightKg: e.lastWeightKg ?? null,
        alternatives: e.alternatives?.map((a) => ({ ...a, lastWeightKg: a.lastWeightKg ?? null })),
      })),
      now: this.now(),
    });
    const active = { mode, routine, draft, activeIndex: 0 };
    this.publish({ active, error: null });
    await this.persist();
  }
  edit(change: (draft: WorkoutDraft) => WorkoutDraft) {
    this.ensure();
    const a = this.state.active;
    if (!a || a.draft.status !== "in_progress" || this.state.busy) return;
    const draft = { ...change(a.draft), updatedAt: this.now().toISOString() };
    this.publish({ active: { ...a, draft } });
    void this.persist().catch(() => {});
  }
  review(effort: string, note: string) {
    this.ensure();
    const a = this.state.active;
    if (!a || a.draft.status !== "in_progress" || this.state.busy) return;
    this.publish({
      active: { ...a, review: { effort: effort.slice(0, 2), note: note.slice(0, 500) } },
    });
    void this.persist().catch(() => {});
  }
  async focus(activeIndex: number) {
    this.ensure();
    const a = this.state.active;
    if (!a || !a.draft.exercises[activeIndex] || this.state.busy) return;
    this.publish({ active: { ...a, activeIndex } });
    await this.persist();
  }
  async complete(ex: number, set: number) {
    this.ensure();
    const a = this.state.active;
    if (!a || a.draft.status !== "in_progress" || this.state.busy) return;
    const previous = a.draft,
      exercise = previous.exercises[ex];
    if (!exercise) return;
    const result = completeSet(previous, ex, set, null);
    let draft = result.draft,
      activeIndex = a.activeIndex;
    if (result.completed) {
      const group = exercise.supersetId;
      if (group && !result.wasWarmup) {
        draft = { ...draft, rest: null };
        const next = nextSupersetSet(draft.exercises, group);
        if (next) activeIndex = next.exerciseIndex;
        if (finishedSupersetRound(previous.exercises, draft.exercises, group))
          draft = {
            ...draft,
            rest: restAfterSet(this.now().getTime(), false, exercise.supersetRestSeconds ?? 90),
          };
      } else
        draft = {
          ...draft,
          rest: restAfterSet(this.now().getTime(), result.wasWarmup, exercise.restSeconds ?? 90),
        };
    } else if (!previous.exercises[ex].sets[set]?.done)
      throw Error("Revisa kg (0–500) y repeticiones (1–100) antes de marcar la serie.");
    this.publish({
      active: { ...a, draft: { ...draft, updatedAt: this.now().toISOString() }, activeIndex },
    });
    await this.persist();
  }
  async finish(effort: number | null, note: string | null) {
    this.ensure();
    if (!this.state.active || this.state.busy) return null;
    await this.flush();
    const a = this.state.active;
    if (a.draft.status === "in_progress") {
      if (
        (effort !== null && (!Number.isInteger(effort) || effort < 1 || effort > 10)) ||
        (note?.length ?? 0) > 500
      )
        throw Error("Revisa esfuerzo (1–10) y nota (máximo 500 caracteres).");
      const draft = finishDraft({ ...a.draft, perceivedEffort: effort, note }, this.now());
      const built = buildPayload(draft, this.now());
      if (!built.ok) throw Error("Completa al menos una serie antes de finalizar.");
      this.publish({ active: { ...a, draft, payload: built.payload }, error: null });
      await this.persist();
    }
    return this.retry();
  }
  async retry() {
    this.ensure();
    await this.flush();
    const a = this.state.active;
    if (!a || a.draft.status !== "pending_save" || this.state.busy) return null;
    const built = a.payload
      ? { ok: true as const, payload: a.payload }
      : buildPayload(a.draft, this.now());
    if (!built.ok) throw Error("No hay series válidas para guardar.");
    const epoch = this.epoch;
    this.publish({ busy: true, error: null });
    try {
      if (a.mode === "real") await this.send(built.payload);
      if (this.disposed || epoch !== this.epoch) return null;
      const demos =
        a.mode === "demo"
          ? [
              {
                id: a.draft.workoutId,
                title: a.routine.session.title ?? `Rutina ${a.routine.session.label}`,
                payload: built.payload,
              },
              ...this.state.demos.filter((d) => d.id !== a.draft.workoutId),
            ].slice(0, 20)
          : this.state.demos;
      this.publish({ active: null, demos });
      try {
        await this.persist();
      } catch (e) {
        this.publish({ active: a });
        throw e;
      }
      return { mode: a.mode, id: a.draft.workoutId };
    } catch (e) {
      if (epoch === this.epoch)
        this.publish({
          error: e instanceof Error ? e.message : "No pudimos enviar el entrenamiento. Reintenta.",
        });
      throw e;
    } finally {
      if (epoch === this.epoch) this.publish({ busy: false });
    }
  }
  async discard() {
    this.ensure();
    await this.tail;
    const previous = this.state.active;
    this.publish({ active: null, error: null, blocked: false });
    try {
      await this.persist();
    } catch (e) {
      this.publish({ active: previous });
      throw e;
    }
  }
  async clearForLogout() {
    await this.flush();
    if (this.state.active)
      throw Error("Retoma o descarta el entrenamiento pendiente antes de salir.");
    await this.storage.remove(this.key);
    if ((await this.storage.get(this.key)) !== null)
      throw Error("No se pudieron retirar los datos locales.");
    this.raw = null;
    this.publish({ demos: [] });
  }
  dispose() {
    this.disposed = true;
    this.epoch++;
    this.listeners.clear();
  }
}
