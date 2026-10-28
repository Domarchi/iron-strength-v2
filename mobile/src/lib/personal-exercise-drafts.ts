import { z } from "zod";
import { MUSCLE_GROUPS } from "../../../src/domain/schemas";
import { recordTypeSchema } from "../../../src/domain/training-metrics";
import {
  personalExerciseEntrySchema,
  personalExerciseFieldsSchema,
  personalExerciseLibrarySchema,
  personalExerciseMutationSchema,
  personalExerciseResultSchema,
  type PersonalExerciseMutation,
  type PersonalExerciseLibrary,
} from "../../../src/lib/mobile/personal-exercise-contracts";
import { AtomicStoreError, type AtomicStorage } from "./atomic-contract";
export type PersonalExerciseEntry = z.infer<typeof personalExerciseEntrySchema>;
const formSchema = z
  .object({
    name: z.string().max(100),
    muscleGroup: z.enum(MUSCLE_GROUPS),
    equipment: z.string().max(50),
    isBodyweight: z.boolean(),
    progressionIncrementKg: z.string().max(30),
    recordType: recordTypeSchema,
  })
  .strict();
export type PersonalExerciseForm = z.infer<typeof formSchema>;
const formFromEntry = (e: PersonalExerciseEntry): PersonalExerciseForm => ({
  name: e.name,
  muscleGroup: e.muscleGroup,
  equipment: e.equipment ?? "",
  isBodyweight: e.isBodyweight,
  progressionIncrementKg: String(e.progressionIncrementKg),
  recordType: e.recordType,
});
function fieldsFromForm(form: PersonalExerciseForm, existing: boolean) {
  const text = form.progressionIncrementKg.trim();
  if (
    !/^(?:\d+(?:[.,]\d{1,2})?|[.,]\d{1,2})$/.test(text) ||
    (!existing && form.recordType === null)
  )
    throw Error("Revisa el tipo y el incremento de carga (0,01 a 20 kg, hasta dos decimales).");
  const parsed = personalExerciseFieldsSchema.safeParse({
    ...form,
    equipment: form.equipment.trim() || null,
    progressionIncrementKg: Number(text.replace(",", ".")),
  });
  if (!parsed.success) throw Error("Revisa nombre, músculo, equipo e incremento de carga.");
  return parsed.data;
}
const changed = (values: PersonalExerciseForm, base: PersonalExerciseEntry | null) =>
  base === null || JSON.stringify(values) !== JSON.stringify(formFromEntry(base));
const draftSchema = z
  .object({
    id: z.uuid(),
    baseRevision: z.number().int().positive().nullable(),
    base: personalExerciseEntrySchema.nullable(),
    changed: z.boolean(),
    values: formSchema,
  })
  .strict()
  .refine((d) =>
    d.base ? d.id === d.base.id && d.baseRevision === d.base.revision : d.baseRevision === null,
  )
  .refine((d) => d.changed === changed(d.values, d.base));
export type PersonalExerciseDraft = z.infer<typeof draftSchema>;
const issueSchema = z.enum(["conflict", "not_found", "invalid_input", "forbidden", "removed"]);
const pendingSchema = z
  .object({ request: personalExerciseMutationSchema, issue: issueSchema.nullable() })
  .strict();
const documentSchema = z
  .object({
    version: z.literal(1),
    userId: z.uuid(),
    draft: draftSchema.nullable(),
    pending: pendingSchema.nullable(),
  })
  .strict()
  .refine((doc) => {
    const request = doc.pending?.request;
    if (!request) return true;
    if (request.operation === "archive" || request.operation === "restore")
      return doc.draft === null;
    if (
      !doc.draft ||
      request.targetId !== doc.draft.id ||
      request.expectedRevision !== (doc.draft.baseRevision ?? 0)
    )
      return false;
    if ((request.operation === "create") !== (doc.draft.base === null)) return false;
    try {
      return (
        JSON.stringify(request.data) ===
        JSON.stringify(fieldsFromForm(doc.draft.values, doc.draft.base !== null))
      );
    } catch {
      return false;
    }
  });
type Document = z.infer<typeof documentSchema>;
type State = Document & {
  ready: boolean;
  busy: boolean;
  blocked: boolean;
  dirty: boolean;
  paused: boolean;
  error: string | null;
};
export function personalExerciseDraftKey(userId: string) {
  return `is:native-personal-exercises:v1:${z.uuid().parse(userId).toLowerCase()}`;
}
export class PersonalExerciseDraftController {
  readonly key: string;
  private state: State;
  private raw: string | null = null;
  private attemptedRaw: string | undefined;
  private tail: Promise<void> = Promise.resolve();
  private sequence = 0;
  private epoch = 0;
  private disposed = false;
  private listeners = new Set<() => void>();
  constructor(
    private userId: string,
    private storage: AtomicStorage,
    private send: (input: PersonalExerciseMutation) => Promise<unknown>,
    private uuid: () => string,
  ) {
    this.userId = z.uuid().parse(userId).toLowerCase();
    this.key = personalExerciseDraftKey(this.userId);
    this.state = {
      ...this.empty(),
      ready: false,
      busy: false,
      blocked: false,
      dirty: false,
      paused: false,
      error: null,
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
      this.state.blocked ||
      this.state.busy ||
      this.state.paused ||
      this.disposed
    )
      throw Error("Espera o recupera los cambios locales antes de continuar.");
  }
  async restore() {
    if (this.state.ready && this.state.dirty)
      throw Error("Conserva primero la edición en memoria; no se reemplaza al releer.");
    if (this.state.paused || (this.state.busy && !this.disposed)) return;
    this.disposed = false;
    const epoch = ++this.epoch;
    this.publish({ busy: true });
    try {
      const raw = await this.storage.get(this.key),
        doc = raw === null ? this.empty() : documentSchema.parse(JSON.parse(raw));
      this.current(epoch);
      if (doc.userId !== this.userId) throw Error("Cuenta distinta");
      this.raw = raw;
      this.attemptedRaw = undefined;
      this.publish({ ...doc, ready: true, blocked: false, dirty: false, error: null });
    } catch {
      if (epoch === this.epoch && !this.disposed)
        this.publish({
          ready: true,
          blocked: true,
          error:
            "No pudimos recuperar tus ejercicios locales. Conservamos el contenido; reintenta con una versión compatible.",
        });
    } finally {
      if (epoch === this.epoch && !this.disposed) this.publish({ busy: false });
    }
  }
  private write(doc: Document, epoch?: number) {
    const encoded = JSON.stringify(documentSchema.parse(doc)),
      sequence = ++this.sequence;
    this.publish({ dirty: true });
    const operation = async () => {
      if (epoch !== undefined) this.current(epoch);
      const raw = await this.storage.get(this.key);
      if (epoch !== undefined) this.current(epoch);
      if (raw !== this.raw && raw !== this.attemptedRaw) throw new AtomicStoreError("conflict");
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
        const message =
          error instanceof AtomicStoreError && error.reason === "conflict"
            ? "Los cambios locales se modificaron en otra ventana. Conservamos tu edición en memoria; no sobrescribimos la otra versión."
            : "No pudimos guardar en este dispositivo. Conservamos tu edición; revisa el almacenamiento y reintenta.";
        if (sequence === this.sequence && !this.disposed)
          this.publish({ dirty: true, error: message });
        throw Error(message);
      },
    );
  }
  private async put(doc: Document) {
    this.publish(doc);
    await this.write(doc);
  }
  async flush() {
    await this.tail;
    if (this.state.dirty)
      throw Error(this.state.error ?? "Quedan cambios sin proteger en este dispositivo.");
  }
  async retryStorage() {
    this.ensure();
    await this.write(this.document());
  }
  pauseWrites() {
    if (!this.state.ready || this.state.busy || this.state.paused || this.disposed)
      throw Error("Espera a que termine la lectura o el envío de ejercicios antes de continuar.");
    this.publish({ paused: true });
    let held = true;
    return () => {
      if (held) {
        held = false;
        this.publish({ paused: false });
      }
    };
  }
  async open(value?: PersonalExerciseEntry) {
    this.ensure();
    if (this.state.pending) throw Error("Resuelve el intento pendiente antes de editar.");
    if (this.state.draft?.changed) {
      if ((!value && !this.state.draft.base) || value?.id === this.state.draft.id)
        return this.state.draft.id;
      throw Error("Guarda o descarta el borrador actual antes de abrir otro ejercicio.");
    }
    const base = value ? personalExerciseEntrySchema.parse(value) : null;
    const draft: PersonalExerciseDraft = base
      ? {
          id: base.id,
          baseRevision: base.revision,
          base,
          changed: false,
          values: formFromEntry(base),
        }
      : {
          id: this.uuid(),
          baseRevision: null,
          base: null,
          changed: true,
          values: {
            name: "",
            muscleGroup: "Core",
            equipment: "",
            isBodyweight: false,
            progressionIncrementKg: "2,5",
            recordType: "weight_reps",
          },
        };
    await this.put({ ...this.document(), draft });
    return draft.id;
  }
  async edit(patch: Partial<PersonalExerciseForm>) {
    this.ensure();
    const draft = this.state.draft;
    if (!draft || this.state.pending) throw Error("Revisa el intento pendiente antes de editar.");
    const values = formSchema.parse({ ...draft.values, ...patch });
    if (draft.base && values.recordType !== draft.base.recordType)
      throw Error("Crea otro ejercicio para cambiar el tipo.");
    await this.put({
      ...this.document(),
      draft: { ...draft, values, changed: changed(values, draft.base) },
    });
  }
  async save() {
    this.ensure();
    const draft = this.state.draft;
    if (!draft || this.state.pending) throw Error("Revisa el intento pendiente antes de guardar.");
    const data = fieldsFromForm(draft.values, draft.base !== null);
    return this.begin(
      personalExerciseMutationSchema.parse({
        version: 1,
        requestId: this.uuid(),
        targetId: draft.id,
        expectedRevision: draft.baseRevision ?? 0,
        operation: draft.base ? "update" : "create",
        data,
      }),
    );
  }
  async archive(value: PersonalExerciseEntry, restore: boolean) {
    this.ensure();
    if (this.state.pending || this.state.draft?.changed)
      throw Error("Guarda o descarta el borrador antes de cambiar el archivo.");
    const entry = personalExerciseEntrySchema.parse(value);
    return this.begin(
      {
        version: 1,
        requestId: this.uuid(),
        targetId: entry.id,
        expectedRevision: entry.revision,
        operation: restore ? "restore" : "archive",
        data: {},
      },
      true,
    );
  }
  private async begin(request: PersonalExerciseMutation, clearDraft = false) {
    this.publish({ busy: true, error: null });
    const epoch = this.epoch;
    try {
      await this.tail;
      this.current(epoch);
      await this.put({
        ...this.document(),
        draft: clearDraft ? null : this.state.draft,
        pending: { request, issue: null },
      });
      this.current(epoch);
      return await this.dispatch(epoch);
    } finally {
      if (epoch === this.epoch && !this.disposed) this.publish({ busy: false });
    }
  }
  private async dispatch(epoch: number) {
    const pending = this.state.pending;
    if (!pending) throw Error("No hay un intento pendiente.");
    try {
      const result = personalExerciseResultSchema.parse(await this.send(pending.request));
      this.current(epoch);
      if (
        result.requestId !== pending.request.requestId ||
        result.targetId !== pending.request.targetId
      )
        throw Error("El servidor no confirmó este intento. Conservamos tus cambios.");
      if (result.status === "removed")
        throw Object.assign(Error("El ejercicio fue eliminado. Conservamos tu formulario."), {
          code: "removed",
        });
      const expected = {
        create: "created",
        update: "updated",
        archive: "archived",
        restore: "restored",
      }[pending.request.operation];
      if (result.status !== expected || result.revision !== pending.request.expectedRevision + 1)
        throw Error("La confirmación no coincide con la operación. Conservamos el intento.");
      const clean = this.empty();
      await this.write(clean);
      this.current(epoch);
      this.publish({ ...clean, error: null });
      return result;
    } catch (error) {
      this.current(epoch);
      const code = error && typeof error === "object" && "code" in error ? error.code : null,
        issue = issueSchema.safeParse(code);
      if (issue.success && this.state.pending) {
        try {
          await this.put({
            ...this.document(),
            pending: { ...this.state.pending, issue: issue.data },
          });
        } catch {
          /* Preserve dirty proposal. */
        }
      }
      this.publish({
        error:
          error instanceof Error
            ? error.message
            : "No pudimos confirmar el guardado. Conservamos tus cambios.",
      });
      throw error;
    }
  }
  async retryPending() {
    this.ensure();
    if (!this.state.pending || this.state.pending.issue)
      throw Error("Revisa la versión actual antes de reintentar.");
    this.publish({ busy: true, error: null });
    const epoch = this.epoch;
    try {
      await this.tail;
      this.current(epoch);
      await this.write(this.document());
      this.current(epoch);
      return await this.dispatch(epoch);
    } finally {
      if (epoch === this.epoch && !this.disposed) this.publish({ busy: false });
    }
  }
  async resolveConflict(value: PersonalExerciseLibrary) {
    this.ensure();
    const snapshot = personalExerciseLibrarySchema.parse(value),
      pending = this.state.pending;
    if (snapshot.userId !== this.userId || !pending?.issue)
      throw Error("Consulta y revisa la versión de esta cuenta antes de continuar.");
    const current = snapshot.exercises.find((e) => e.id === pending.request.targetId) ?? null,
      draft = this.state.draft;
    if (draft?.base && !current)
      throw Error("El ejercicio ya no existe. Conserva una copia con otro identificador.");
    if (draft && !draft.base && current)
      throw Error("Ese identificador ya existe. Conserva una copia independiente.");
    if (draft && current && draft.values.recordType !== current.recordType)
      throw Error("El tipo no coincide. Conserva una copia independiente.");
    await this.put({
      ...this.document(),
      pending: null,
      draft: draft
        ? {
            ...draft,
            base: current,
            baseRevision: current?.revision ?? null,
            changed: changed(draft.values, current),
          }
        : null,
    });
    return current;
  }
  async forkDraft() {
    this.ensure();
    const draft = this.state.draft;
    if (!draft || (this.state.pending && !this.state.pending.issue))
      throw Error("Comprueba primero el intento sin confirmar.");
    const copy: PersonalExerciseDraft = {
      ...draft,
      id: this.uuid(),
      base: null,
      baseRevision: null,
      changed: true,
      values: {
        ...draft.values,
        name: draft.values.name.slice(0, 92) + " (copia)",
        recordType: draft.values.recordType ?? "weight_reps",
      },
    };
    await this.put({ ...this.document(), draft: copy, pending: null });
    return copy.id;
  }
  async discard(confirmed = false) {
    this.ensure();
    if (!confirmed) throw Error("Confirma el descarte del formulario o intento pendiente.");
    await this.put(this.empty());
  }
  async clearForLogout() {
    const epoch = this.epoch;
    this.current(epoch);
    const release = this.state.paused ? () => {} : this.pauseWrites();
    try {
      if (this.state.blocked) throw Error("Recupera los ejercicios locales antes de salir.");
      await this.flush();
      this.current(epoch);
      if (this.state.pending || this.state.draft?.changed)
        throw Error("Guarda o descarta los ejercicios pendientes antes de salir.");
      await this.write(this.empty(), epoch);
      this.current(epoch);
      this.publish(this.empty());
    } finally {
      release();
    }
  }
  dispose() {
    this.disposed = true;
    this.epoch++;
    this.listeners.clear();
  }
}
