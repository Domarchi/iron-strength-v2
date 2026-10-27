import {
  applyWarmupProposal,
  applySessionRest,
  captureRestPreference,
  type WarmupProposal,
} from "./workout-tools";
import {
  changeTypedTrainingStructure,
  legacyStructureOperation,
  catalogSelectionSchema,
  type CatalogSelection,
} from "./typed-training-structure";
import { typedRecordingPayloadSchema } from "../../../src/lib/mobile/typed-recording-contracts";
import {
  typedContextSchema,
  typedDraftSchema,
  createTypedDraft,
  upgradeLegacyTraining,
  buildTypedRecording,
  completeTypedSet,
  type TypedTrainingDraft,
  type TypedTrainingContext,
} from "./typed-training";
import {
  queuedReceiptSchema,
  type QueuedWorkoutPayload,
  type QueuedSaveReply,
} from "./queued-recording";
import { createRepeatedTraining } from "./repeat-training";
import { createTypedRepeatedTraining } from "./typed-repeat-training";
import type { TypedRepeatPlan } from "../../../src/domain/typed-workout-repeat";
import type { RepeatPlan } from "../../../src/domain/workout-repeat";
import { buildTrainingRecording } from "./recording";
import type { MobileCatalogEntry } from "../../../src/lib/mobile/exercise-contracts";
import {
  personalContextSchema,
  nativeWorkoutDraftSchema,
  nativeWorkoutPayloadSchema,
  createPersonalTrainingDraft,
  buildPersonalTrainingPayload,
  isPersonalWorkoutPayload,
  isRecordingPayload,
  type PersonalTrainingContext,
  type NativeWorkoutDraft,
} from "./personal-training";
import { z } from "zod";
import { changeTrainingStructure, type TrainingStructureChange } from "./training-structure";
import { AtomicStoreError } from "./atomic-contract";
import { workoutPayloadSchema } from "../../../src/lib/workout/payload";
import { mobileRoutineSchema, type MobileRoutine } from "../../../src/lib/mobile/contracts";
import {
  buildPayload,
  completeSet,
  createDraft,
  prefillDraftExercises,
  finishDraft,
  type WorkoutPayload,
} from "../../../src/lib/workout/runner-state";
import { finishedSupersetRound, nextSupersetSet } from "../../../src/domain/superset-rounds";
import { adjustRest, restAfterSet } from "../../../src/domain/rest-timer";
import {
  elapsedSessionSeconds,
  pauseSession,
  resumeSession,
} from "../../../src/domain/session-timer";
const buildNativePayload = (draft: NativeWorkoutDraft, now: Date) =>
  draft.version === 3 ? buildPersonalTrainingPayload(draft, now) : buildPayload(draft, now);
export interface TrainingStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  compareAndSet?(key: string, before: string | null, next: string): Promise<void>;
}
export type SaveReply = QueuedSaveReply;
const activeSchema = z
  .object({
    mode: z.enum(["demo", "real"]),
    routine: z.union([mobileRoutineSchema, personalContextSchema]),
    draft: nativeWorkoutDraftSchema,
    activeIndex: z.number().int().min(0).max(14),
    payload: nativeWorkoutPayloadSchema.optional(),
    review: z.object({ effort: z.string().max(2), note: z.string().max(500) }).optional(),
    pause: z
      .object({
        version: z.literal(1),
        pausedAtMs: z.number().int().nonnegative().nullable(),
        pausedMilliseconds: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      })
      .strict()
      .optional(),
  })
  .refine((a) => {
    const personal = a.routine.version === 2;
    if (personal !== (a.draft.version === 3) || (personal && a.mode !== "real")) return false;
    if (
      a.draft.version === 3 &&
      a.routine.version === 2 &&
      (JSON.stringify(a.draft.origin) !== JSON.stringify(a.routine.origin) ||
        a.draft.title !== a.routine.session.title ||
        a.draft.exercises.length !== a.routine.exercises.length ||
        a.draft.exercises.some(
          (e, i) => e.sessionExerciseId !== a.routine.exercises[i].sessionExerciseId,
        ))
    )
      return false;
    if (a.payload && isRecordingPayload(a.payload)) {
      if (a.mode !== "real" || a.draft.status !== "pending_save") return false;
      const built = buildTrainingRecording(
        a.routine,
        a.draft,
        new Date(a.payload.workout.finishedAt),
      );
      return built.ok && JSON.stringify(built.payload) === JSON.stringify(a.payload);
    }
    if (a.payload && isPersonalWorkoutPayload(a.payload) && a.draft.version === 3) {
      if (
        a.payload.title !== a.draft.title ||
        JSON.stringify(a.payload.origin) !== JSON.stringify(a.draft.origin)
      )
        return false;
    }
    return (
      !a.payload ||
      (a.payload.id === a.draft.workoutId && isPersonalWorkoutPayload(a.payload) === personal)
    );
  });
export type ActiveTraining = z.infer<typeof activeSchema>;
const typedActiveSchema = z
  .object({
    ...activeSchema.shape,
    mode: z.literal("real"),
    routine: typedContextSchema,
    draft: typedDraftSchema,
    payload: typedRecordingPayloadSchema.optional(),
    review: z
      .object({
        effort: z.string().max(2),
        note: z.string().refine((v) => Array.from(v).length <= 500),
      })
      .optional(),
  })
  .strict()
  .refine((a) => {
    const built = buildTypedRecording(
      a.routine,
      a.draft,
      new Date(a.draft.finishedAt ?? a.draft.updatedAt),
    );
    if (a.draft.status === "in_progress")
      return !a.payload && (built.ok || built.reason === "no_sets");
    return !!a.payload && built.ok && JSON.stringify(built.payload) === JSON.stringify(a.payload);
  });
export type TypedActiveTraining = z.infer<typeof typedActiveSchema>;
export type CurrentTraining = ActiveTraining | TypedActiveTraining;
export const isTypedTraining = (a: CurrentTraining): a is TypedActiveTraining =>
  a.draft.version === 4;
export const trainingTitle = (a: CurrentTraining) =>
  isTypedTraining(a)
    ? (a.routine.title ?? `Sesión ${a.routine.sessionLabel}`)
    : (a.routine.session.title ?? `Sesión ${a.routine.session.label}`);
export type DemoResult = { id: string; title: string; payload: WorkoutPayload };
const envelopeBase = z.object({
  version: z.literal(1),
  userId: z.uuid(),
  active: activeSchema.nullable(),
  demos: z
    .array(z.object({ id: z.uuid(), title: z.string(), payload: workoutPayloadSchema }))
    .max(20),
});
const withoutRecording = (r: Pick<z.infer<typeof envelopeBase>, "active">) =>
  !r.active?.payload || !isRecordingPayload(r.active.payload);
const legacyEnvelopeSchema = envelopeBase.refine(
  (r) => r.active?.pause === undefined && withoutRecording(r),
);
const currentEnvelopeSchema = envelopeBase
  .extend({ version: z.literal(2), previousFormat: z.string().min(1).optional() })
  .refine(withoutRecording)
  .refine((r) => {
    if (r.previousFormat === undefined) return true;
    try {
      const previous = legacyEnvelopeSchema.safeParse(JSON.parse(r.previousFormat));
      return (
        previous.success &&
        previous.data.userId === r.userId &&
        previous.data.active?.draft.userId === r.userId &&
        previous.data.active?.draft.workoutId === r.active?.draft.workoutId
      );
    } catch {
      return false;
    }
  });
const previousEnvelopeSchema = z.union([legacyEnvelopeSchema, currentEnvelopeSchema]);
const recordingEnvelopeSchema = z
  .object({
    ...envelopeBase.shape,
    version: z.literal(3),
    previousFormat: z.string().min(1).optional(),
  })
  .refine(
    (r) =>
      r.active?.mode !== "real" ||
      r.active.draft.status !== "pending_save" ||
      (!!r.active.payload && isRecordingPayload(r.active.payload)),
  )
  .refine((r) => {
    if (!r.previousFormat) return true;
    try {
      const previous = previousEnvelopeSchema.safeParse(JSON.parse(r.previousFormat));
      return (
        previous.success &&
        previous.data.userId === r.userId &&
        previous.data.active?.draft.userId === r.userId &&
        previous.data.active?.draft.workoutId === r.active?.draft.workoutId
      );
    } catch {
      return false;
    }
  });
const oldEnvelopeSchema = z.union([previousEnvelopeSchema, recordingEnvelopeSchema]);
const typedEnvelopeSchema = z
  .object({
    ...envelopeBase.shape,
    version: z.literal(4),
    active: z.union([activeSchema, typedActiveSchema]).nullable(),
    previousFormat: z.string().min(1).optional(),
  })
  .strict()
  .refine((r) => {
    if (!r.previousFormat) return true;
    try {
      const previous = oldEnvelopeSchema.safeParse(JSON.parse(r.previousFormat));
      return (
        previous.success &&
        previous.data.userId === r.userId &&
        (!previous.data.active ||
          (previous.data.active.draft.userId === r.userId &&
            previous.data.active.draft.workoutId === r.active?.draft.workoutId))
      );
    } catch {
      return false;
    }
  });
const envelopeSchema = z.union([oldEnvelopeSchema, typedEnvelopeSchema]);
const currentActiveSchema = z.union([activeSchema, typedActiveSchema]);
export type TrainingState = {
  ready: boolean;
  active: CurrentTraining | null;
  demos: DemoResult[];
  dirty: boolean;
  busy: boolean;
  closing: boolean;
  error: string | null;
  blocked: boolean;
};
const initial = (): TrainingState => ({
  ready: false,
  active: null,
  demos: [],
  dirty: false,
  busy: false,
  closing: false,
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
  private formatVersion: 1 | 2 | 3 | 4 = 1;
  private previousFormat: string | null = null;
  private readonly key: string;
  constructor(
    private userId: string,
    private storage: TrainingStorage,
    private send: (payload: QueuedWorkoutPayload) => Promise<SaveReply>,
    private now = () => new Date(),
    private uuid: () => string = () => globalThis.crypto.randomUUID(),
    private defaultRestSeconds: () => number = () => 90,
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
    this.state = { ...this.state, ...p };
    if (!this.disposed) this.listeners.forEach((fn) => fn());
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
        this.formatVersion = 1;
        this.previousFormat = null;
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
      this.formatVersion = data.version;
      this.previousFormat = data.version !== 1 ? (data.previousFormat ?? null) : null;
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
      version: this.formatVersion,
      userId: this.userId,
      active: this.state.active,
      demos: this.state.demos,
      ...(this.state.active && this.previousFormat ? { previousFormat: this.previousFormat } : {}),
    });
    this.publish({ dirty: true });
    const operation = this.serialize(async () => {
      // Captured personal edits remain owned by this key after auth unmounts the provider.
      const current = await this.storage.get(this.key);
      if (current !== this.raw && current !== this.attempt)
        throw Error(
          "El registro cambió en otra ventana. Conservamos tus datos; vuelve a abrir la app para revisar.",
        );
      this.attempt = encoded;
      if (!this.storage.compareAndSet) throw new AtomicStoreError("unsupported");
      await this.storage.compareAndSet(this.key, current, encoded);
      if ((await this.storage.get(this.key)) !== encoded)
        throw Error("No se pudo verificar el almacenamiento.");
      this.raw = encoded;
      this.attempt = null;
      if (!this.state.active) this.previousFormat = null;
      if (rev === this.revision) this.publish({ dirty: false, error: null });
    });
    const p = operation.catch((e: unknown) => {
      throw new Error(
        e instanceof AtomicStoreError
          ? e.reason === "conflict"
            ? "El registro cambió en otra ventana. Conservamos tus datos; vuelve a abrir la app para revisar."
            : "Este entorno no permite proteger el registro entre ventanas. Usa la app instalada o un navegador compatible."
          : e instanceof Error && e.message.startsWith("El registro cambió")
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
    if (this.state.busy || this.state.closing)
      throw Error("Espera a que termine el guardado o envío.");
    await this.persist();
  }
  private assertNotPaused(active: CurrentTraining | null) {
    if (active?.pause?.pausedAtMs != null)
      throw Error(
        "El entrenamiento está en pausa. Reanuda antes de registrar o modificar ejercicios.",
      );
  }
  private liveForControls() {
    this.ensure();
    const a = this.state.active;
    if (!a || a.draft.status !== "in_progress")
      throw Error("Retoma un entrenamiento en curso para usar la pausa.");
    if (this.state.busy || this.state.closing)
      throw Error("Espera a que termine el guardado o envío.");
    return a;
  }
  private prepareExtendedFormat() {
    if (this.formatVersion === 1) {
      if (!this.raw) throw Error("Protege el registro local antes de modificarlo.");
      this.previousFormat = this.raw;
      this.formatVersion = 2;
    }
  }
  private prepareRecordingFormat() {
    if (this.formatVersion >= 3) return;
    if (!this.raw) throw Error("Protege el registro local antes de finalizarlo.");
    this.previousFormat = this.raw;
    this.formatVersion = 3;
  }
  private prepareTypedFormat() {
    if (this.formatVersion === 4) return;
    this.previousFormat = this.raw;
    this.formatVersion = 4;
  }
  async startTyped(value: TypedTrainingContext) {
    this.ensure();
    if (this.state.active || this.state.busy || this.state.closing)
      throw Error("Retoma o resuelve primero el entrenamiento actual.");
    const routine = typedContextSchema.parse(value);
    const draft = captureRestPreference(
      createTypedDraft({
        context: routine,
        userId: this.userId,
        workoutId: this.uuid(),
        now: this.now(),
      }),
      this.defaultRestSeconds(),
    );
    this.prepareTypedFormat();
    this.publish({
      active: typedActiveSchema.parse({ mode: "real", routine, draft, activeIndex: 0 }),
      error: null,
    });
    await this.persist();
  }
  async setSessionRest(proposal: {
    workoutId: string;
    rowId: string;
    expectedDraft: string;
    seconds: number;
  }) {
    this.liveForControls();
    await this.flush();
    const active = this.liveForControls();
    this.assertNotPaused(active);
    const index = active.draft.exercises.findIndex((e) => e.sessionExerciseId === proposal.rowId);
    if (
      active.draft.workoutId !== proposal.workoutId ||
      index < 0 ||
      JSON.stringify(active.draft) !== proposal.expectedDraft
    )
      throw Error("El registro cambió. Revisa nuevamente el descanso antes de confirmar.");
    const draft = applySessionRest(active.draft, index, proposal.seconds);
    this.publish({
      active: currentActiveSchema.parse({
        ...active,
        draft: { ...draft, updatedAt: this.now().toISOString() },
      }),
      error: null,
    });
    await this.persist();
  }
  async addWarmups(proposal: WarmupProposal) {
    this.liveForControls();
    await this.flush();
    const active = this.liveForControls();
    this.assertNotPaused(active);
    const next = applyWarmupProposal(active, proposal, this.now());
    if (next === active) return;
    this.publish({ active: currentActiveSchema.parse(next), error: null });
    await this.persist();
  }
  async upgradeRecording() {
    this.liveForControls();
    await this.flush();
    const a = this.liveForControls();
    if (isTypedTraining(a)) return;
    if (a.mode !== "real" || a.payload)
      throw Error("Un cierre pendiente o una demo conserva su formato original.");
    const converted = upgradeLegacyTraining(a.routine, a.draft);
    this.prepareTypedFormat();
    this.publish({
      active: typedActiveSchema.parse({ ...a, routine: converted.context, draft: converted.draft }),
      error: null,
    });
    await this.persist();
  }
  editTyped(change: (draft: TypedTrainingDraft) => TypedTrainingDraft) {
    this.ensure();
    const a = this.state.active;
    if (
      !a ||
      !isTypedTraining(a) ||
      a.draft.status !== "in_progress" ||
      this.state.busy ||
      this.state.closing
    )
      return;
    this.assertNotPaused(a);
    const draft = typedDraftSchema.parse({
      ...change(a.draft),
      updatedAt: this.now().toISOString(),
    });
    this.publish({ active: typedActiveSchema.parse({ ...a, draft }) });
    void this.persist().catch(() => {});
  }
  async organize(operation: TrainingStructureChange) {
    this.liveForControls();
    await this.flush();
    const active = this.liveForControls();
    this.assertNotPaused(active);
    if (isTypedTraining(active)) {
      const next = changeTypedTrainingStructure(
        active,
        legacyStructureOperation(operation),
        this.now(),
        this.uuid,
      );
      this.publish({ active: typedActiveSchema.parse(next), error: null });
      await this.persist();
      return;
    }
    const next = changeTrainingStructure(active, operation, this.now(), this.uuid);
    if (next === active) return;
    const checked = activeSchema.parse(next);
    this.prepareExtendedFormat();
    this.publish({ active: checked, error: null });
    await this.persist();
  }
  async organizeCatalog(value: CatalogSelection) {
    const initial = this.liveForControls();
    const operation = catalogSelectionSchema.parse(value);
    await this.flush();
    const active = this.liveForControls();
    this.assertNotPaused(active);
    if (active.draft.workoutId !== initial.draft.workoutId)
      throw Error(
        "El entrenamiento cambió. Conservamos la selección sin aplicarla a otro registro.",
      );
    if (
      !isTypedTraining(active) &&
      (active.mode !== "real" || active.routine.version !== 2 || active.draft.version !== 3)
    )
      throw Error("Solo puedes organizar un entrenamiento personal o libre en curso.");
    const entries = operation.kind === "add" ? operation.entries : [operation.entry];
    if (!isTypedTraining(active) && entries.every((e) => e.recordType === null)) {
      const legacy = (e: (typeof entries)[number]) => ({
        id: e.id,
        name: e.name,
        muscleGroup: e.muscleGroup,
        equipment: e.equipment,
        isBodyweight: e.isBodyweight,
        progressionIncrementKg: e.progressionIncrementKg,
      });
      const op =
        operation.kind === "add"
          ? { ...operation, entries: operation.entries.map(legacy) }
          : { ...operation, entry: legacy(operation.entry) };
      const next = changeTrainingStructure(active, op, this.now(), this.uuid);
      if (next === active) return;
      this.prepareExtendedFormat();
      this.publish({ active: activeSchema.parse(next), error: null });
      await this.persist();
      return;
    }
    const typed = isTypedTraining(active)
      ? active
      : (() => {
          const converted = upgradeLegacyTraining(active.routine, active.draft);
          return typedActiveSchema.parse({
            ...active,
            routine: converted.context,
            draft: converted.draft,
          });
        })();
    const next = typedActiveSchema.parse(
      changeTypedTrainingStructure(typed, operation, this.now(), this.uuid),
    );
    this.prepareTypedFormat();
    this.publish({ active: next, error: null });
    await this.persist();
  }
  async pause() {
    this.liveForControls();
    await this.flush();
    const a = this.liveForControls();
    if (a.pause?.pausedAtMs != null) return;
    this.prepareExtendedFormat();
    this.publish({
      active: { ...a, pause: pauseSession(a.pause ?? null, this.now().getTime()) },
      error: null,
    });
    await this.persist();
  }
  async resume() {
    this.liveForControls();
    await this.flush();
    const a = this.liveForControls();
    if (a.pause?.pausedAtMs == null) return;
    const pause = resumeSession(a.pause, this.now().getTime());
    this.publish({ active: { ...a, pause: pause ?? undefined }, error: null });
    await this.persist();
  }
  async changeRest(deltaSeconds: number | null) {
    this.ensure();
    if (deltaSeconds !== null && deltaSeconds !== -15 && deltaSeconds !== 15)
      throw Error("Ajusta el descanso en pasos de 15 segundos.");
    const a = this.state.active;
    if (!a || a.draft.status !== "in_progress") return;
    if (this.state.busy || this.state.closing)
      throw Error("Espera a que termine el guardado o envío.");
    const now = this.now();
    const draft = {
      ...a.draft,
      updatedAt: now.toISOString(),
      rest:
        deltaSeconds === null || !a.draft.rest
          ? null
          : adjustRest(a.draft.rest, now.getTime(), deltaSeconds),
    };
    this.publish({ active: currentActiveSchema.parse({ ...a, draft }) });
    await this.persist();
  }
  async start(routine: MobileRoutine, mode: "demo" | "real") {
    this.ensure();
    if (this.state.busy || this.state.closing)
      throw Error("Espera a que termine el guardado o envío.");
    if (this.state.active)
      throw Error("Ya tienes un entrenamiento. Retómalo o descártalo primero.");
    const draft = captureRestPreference(
      createDraft({
        workoutId: this.uuid(),
        userId: this.userId,
        plannedSession: routine.session,
        exercises: routine.exercises.map((e) => ({
          ...e,
          lastWeightKg: e.lastWeightKg ?? null,
          alternatives: e.alternatives?.map((a) => ({
            ...a,
            lastWeightKg: a.lastWeightKg ?? null,
          })),
        })),
        now: this.now(),
      }),
      this.defaultRestSeconds(),
    );
    const active = { mode, routine, draft, activeIndex: 0 };
    this.publish({ active, error: null });
    await this.persist();
  }
  async startPersonal(value: PersonalTrainingContext) {
    this.ensure();
    if (this.state.busy || this.state.closing)
      throw Error("Espera a que termine el guardado o envío.");
    if (this.state.active)
      throw Error("Ya tienes un entrenamiento. Retómalo o descártalo primero.");
    const routine = personalContextSchema.parse(value);
    if (routine.origin.kind === "personal" && !routine.exercises.length)
      throw Error("Agrega ejercicios a la rutina antes de empezar.");
    const draft = captureRestPreference(
      createPersonalTrainingDraft({
        context: routine,
        userId: this.userId,
        workoutId: this.uuid(),
        now: this.now(),
      }),
      this.defaultRestSeconds(),
    );
    this.publish({ active: { mode: "real", routine, draft, activeIndex: 0 }, error: null });
    await this.persist();
  }
  async startRepeated(plan: RepeatPlan | TypedRepeatPlan) {
    this.ensure();
    if (this.state.busy || this.state.closing)
      throw Error("Espera a que termine el guardado o envío.");
    if (this.state.active)
      throw Error("Ya tienes un entrenamiento. Retómalo o descártalo primero.");
    if ("version" in plan) {
      const next = createTypedRepeatedTraining(
        plan,
        {
          userId: this.userId,
          workoutId: this.uuid(),
          now: this.now(),
        },
        this.uuid,
      );
      const active = typedActiveSchema.parse({ mode: "real", ...next, activeIndex: 0 });
      this.prepareTypedFormat();
      this.publish({ active, error: null });
      await this.persist();
      return;
    }
    const next = createRepeatedTraining(
      plan,
      {
        userId: this.userId,
        workoutId: this.uuid(),
        now: this.now(),
      },
      this.uuid,
    );
    const active = activeSchema.parse({ mode: "real", ...next, activeIndex: 0 });
    this.publish({ active, error: null });
    await this.persist();
  }
  async appendFreeExercises(entries: MobileCatalogEntry[]) {
    this.ensure();
    const a = this.state.active;
    this.assertNotPaused(a);
    if (
      !a ||
      a.draft.version !== 3 ||
      a.routine.version !== 2 ||
      a.routine.origin.kind !== "free" ||
      a.draft.status !== "in_progress" ||
      this.state.busy ||
      this.state.closing
    )
      throw Error("Retoma un entrenamiento libre en curso antes de agregar ejercicios.");
    if (!entries.length) throw Error("Selecciona al menos un ejercicio.");
    if (a.draft.exercises.length + entries.length > 15)
      throw Error("Máximo 15 ejercicios por entrenamiento.");
    const additions = entries.map((e) => ({
      sessionExerciseId: this.uuid(),
      exerciseId: e.id,
      name: e.name,
      isBodyweight: e.isBodyweight,
      prescribed: { sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: null },
      lastWeightKg: null,
      note: null,
      restSeconds: 90,
      supersetId: null,
      supersetRestSeconds: null,
    }));
    const routine = personalContextSchema.parse({
      ...a.routine,
      exercises: [...a.routine.exercises, ...additions],
    });
    const draft = {
      ...a.draft,
      updatedAt: this.now().toISOString(),
      exercises: [...a.draft.exercises, ...prefillDraftExercises(additions)],
    };
    this.publish({ active: activeSchema.parse({ ...a, routine, draft }), error: null });
    await this.persist();
  }
  edit(change: (draft: NativeWorkoutDraft) => NativeWorkoutDraft) {
    this.ensure();
    const a = this.state.active;
    if (!a || a.draft.status !== "in_progress" || this.state.busy || this.state.closing) return;
    this.assertNotPaused(a);
    if (isTypedTraining(a)) throw Error("Usa los campos del registro avanzado.");
    const draft = { ...change(a.draft), updatedAt: this.now().toISOString() };
    this.publish({ active: { ...a, draft } });
    void this.persist().catch(() => {});
  }
  review(effort: string, note: string) {
    this.ensure();
    const a = this.state.active;
    if (!a || a.draft.status !== "in_progress" || this.state.busy || this.state.closing) return;
    this.publish({
      active: {
        ...a,
        review: { effort: effort.slice(0, 2), note: Array.from(note).slice(0, 500).join("") },
      },
    });
    void this.persist().catch(() => {});
  }
  async focus(activeIndex: number) {
    this.ensure();
    const a = this.state.active;
    if (!a || !a.draft.exercises[activeIndex] || this.state.busy || this.state.closing) return;
    this.publish({ active: { ...a, activeIndex } });
    await this.persist();
  }
  async complete(ex: number, set: number) {
    this.ensure();
    const a = this.state.active;
    if (!a || a.draft.status !== "in_progress" || this.state.busy || this.state.closing) return;
    this.assertNotPaused(a);
    if (isTypedTraining(a)) {
      const completed = completeTypedSet(a.draft, ex, set, this.now(), a.activeIndex);
      this.publish({ active: { ...a, ...completed } });
      await this.persist();
      return;
    }
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
          rest: restAfterSet(
            this.now().getTime(),
            result.wasWarmup,
            (exercise.supersetId ? exercise.supersetRestSeconds : exercise.restSeconds) ?? 90,
          ),
        };
    } else if (!previous.exercises[ex].sets[set]?.done)
      throw Error("Revisa kg (0–500) y repeticiones (1–100) antes de marcar la serie.");
    this.publish({
      active: { ...a, draft: { ...draft, updatedAt: this.now().toISOString() }, activeIndex },
    });
    await this.persist();
  }
  async finish(effort: number | null, note: string | null, options: { localOnly?: boolean } = {}) {
    this.ensure();
    if (!this.state.active || this.state.busy || this.state.closing) return null;
    this.publish({ closing: true });
    try {
      await this.flush();
      this.ensure();
      const a = this.state.active;
      if (a.draft.status === "in_progress") {
        if (
          (effort !== null && (!Number.isInteger(effort) || effort < 1 || effort > 10)) ||
          Array.from(note ?? "").length > 500
        )
          throw Error("Revisa esfuerzo (1–10) y nota (máximo 500 caracteres).");
        const finishedAt = this.now();
        const draft = {
          ...(isTypedTraining(a)
            ? {
                ...a.draft,
                status: "pending_save" as const,
                finishedAt: finishedAt.toISOString(),
                perceivedEffort: effort,
                note,
              }
            : finishDraft({ ...a.draft, perceivedEffort: effort, note }, finishedAt)),
          durationSeconds: elapsedSessionSeconds(
            Date.parse(a.draft.startedAt),
            finishedAt.getTime(),
            a.pause ?? null,
          ),
        };
        const built = isTypedTraining(a)
          ? buildTypedRecording(a.routine, typedDraftSchema.parse(draft), this.now())
          : a.mode === "real"
            ? buildTrainingRecording(a.routine, nativeWorkoutDraftSchema.parse(draft), this.now())
            : buildNativePayload(nativeWorkoutDraftSchema.parse(draft), this.now());
        if (!built.ok)
          throw Error(
            built.reason === "no_sets"
              ? "Completa al menos una serie antes de finalizar."
              : "Revisa las series completadas antes de finalizar.",
          );
        if (a.mode === "real") this.prepareRecordingFormat();
        const active = isTypedTraining(a)
          ? typedActiveSchema.parse({ ...a, draft, payload: built.payload })
          : activeSchema.parse({ ...a, draft, payload: built.payload });
        this.publish({ active, error: null });
        await this.persist();
      }
      if (options.localOnly && this.state.active?.mode === "real") {
        const prepared = await this.pendingPayload();
        return prepared ? { mode: "pending" as const, id: prepared.active.draft.workoutId } : null;
      }
      return await this.performRetry();
    } finally {
      this.publish({ closing: false });
    }
  }
  private async pendingPayload(): Promise<{
    active: CurrentTraining;
    payload: QueuedWorkoutPayload;
  } | null> {
    this.ensure();
    await this.flush();
    this.ensure();
    const a = this.state.active;
    if (!a || a.draft.status !== "pending_save" || this.state.busy) return null;
    const built = a.payload
      ? { ok: true as const, payload: a.payload }
      : isTypedTraining(a)
        ? buildTypedRecording(a.routine, a.draft, this.now())
        : buildNativePayload(a.draft, this.now());
    if (!built.ok) throw Error("No hay series válidas para guardar.");
    if (built.payload.id !== a.draft.workoutId)
      throw Error(
        "El envío no corresponde a este entrenamiento. Conservamos el registro para revisarlo.",
      );
    const active = a.payload
      ? a
      : isTypedTraining(a)
        ? typedActiveSchema.parse({ ...a, payload: built.payload })
        : activeSchema.parse({ ...a, payload: built.payload });
    if (!a.payload) {
      this.publish({ active });
      await this.persist();
    }
    return { active, payload: active.payload ?? built.payload };
  }
  async retry() {
    if (this.state.closing) return null;
    return this.performRetry();
  }
  async pendingForQueue() {
    if (this.state.busy || this.state.closing) return null;
    const pending = await this.pendingPayload();
    if (!pending || pending.active.mode !== "real") return null;
    return {
      userId: pending.active.draft.userId,
      title: trainingTitle(pending.active),
      payload: pending.payload,
    };
  }
  async releaseQueued(id: string, payload: QueuedWorkoutPayload) {
    this.ensure();
    await this.flush();
    this.ensure();
    const previous = this.state.active;
    if (
      this.state.busy ||
      this.state.closing ||
      !previous ||
      previous.mode !== "real" ||
      previous.draft.status !== "pending_save" ||
      previous.draft.workoutId !== id ||
      JSON.stringify(previous.payload) !== JSON.stringify(payload)
    )
      throw Error("El origen cambió. Conservamos ambas copias para comprobar el registro.");
    this.publish({ active: null, busy: true, error: null });
    try {
      await this.persist();
    } catch (e) {
      this.publish({ active: previous });
      throw e;
    } finally {
      this.publish({ busy: false });
    }
  }
  private async performRetry() {
    const prepared = await this.pendingPayload();
    this.ensure();
    if (
      !prepared ||
      this.state.busy ||
      this.state.active?.draft.workoutId !== prepared.active.draft.workoutId
    )
      return null;
    const { active: a, payload } = prepared;
    const epoch = this.epoch;
    this.publish({ busy: true, error: null });
    try {
      if (a.mode === "real") {
        const response = await this.send(payload);
        const reply = queuedReceiptSchema(payload).safeParse(response);
        if (!reply.success)
          throw Error("La confirmación requiere una versión compatible. Conservamos el registro.");
        if (reply.data.workoutId !== payload.id)
          throw Error("El servidor confirmó otro entrenamiento. Conservamos el registro.");
      }
      if (this.disposed || epoch !== this.epoch) return null;
      if (a.mode === "demo" && (payload.version === 3 || isPersonalWorkoutPayload(payload)))
        throw Error("Una demo no puede guardar un registro personal.");
      const demos =
        a.mode === "demo"
          ? [
              {
                id: a.draft.workoutId,
                title: trainingTitle(a),
                payload: workoutPayloadSchema.parse(payload),
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
    if (this.state.busy || this.state.closing)
      throw Error("Espera a que termine el guardado o envío.");
    const previous = this.state.active;
    this.publish({ busy: true });
    try {
      await this.tail;
      this.ensure();
      this.publish({ active: null, error: null, blocked: false });
      await this.persist();
    } catch (e) {
      this.publish({ active: previous });
      throw e;
    } finally {
      this.publish({ busy: false });
    }
  }
  async clearForLogout() {
    this.ensure();
    if (this.state.busy || this.state.closing)
      throw Error("Espera a que termine el guardado o envío.");
    await this.flush();
    this.ensure();
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
