import { z } from "zod";
import { AtomicStoreError, type AtomicStorage } from "./atomic-contract";
import {
  editableTypedPersonalItems,
  upgradePersonalEditorItem,
  typedPersonalEditorItemSchema,
  typedPersonalItemsInput,
} from "../../../src/domain/typed-personal-routines";
import { forkPersonalItems } from "../../../src/domain/personal-routines";
import { parseLegacyLibraryDocument, type PersonalDraft as LegacyDraft } from "./library-drafts";
import {
  typedPersonalMutationSchema,
  typedPersonalMutationResultSchema,
  upgradePersonalRoutine,
  type TypedPersonalMutation,
  type TypedPersonalMutationResult,
  type TypedPersonalRoutine,
} from "../../../src/lib/mobile/typed-personal-contracts";
import {
  personalMutationSchema,
  personalMutationResultSchema,
  type PersonalMutation,
  type PersonalMutationResult,
  type PersonalRoutine,
} from "../../../src/lib/mobile/personal-contracts";

const draftSchema = z
  .object({
    id: z.uuid(),
    baseRevision: z.number().int().nonnegative().nullable(),
    folderId: z.uuid().nullable(),
    changed: z.boolean(),
    name: z.string().max(100),
    items: z.array(typedPersonalEditorItemSchema).max(15),
  })
  .strict();
export type TypedPersonalDraft = z.infer<typeof draftSchema>;
const issueSchema = z.enum(["conflict", "not_found", "invalid_input", "forbidden", "removed"]);
const pendingSchema = z
  .object({
    request: z.union([personalMutationSchema, typedPersonalMutationSchema]),
    draftId: z.uuid().nullable(),
    issue: issueSchema.nullable(),
  })
  .strict();
const documentSchema = z
  .object({
    version: z.literal(2),
    previousFormat: z.string().nullable(),
    userId: z.uuid(),
    drafts: z.array(draftSchema),
    pending: pendingSchema.nullable(),
  })
  .strict()
  .refine((doc) => {
    if (doc.previousFormat === null) return true;
    try {
      return parseLegacyLibraryDocument(JSON.parse(doc.previousFormat)).userId === doc.userId;
    } catch {
      return false;
    }
  })
  .refine(
    (doc) =>
      new Set(doc.drafts.map((d) => d.id)).size === doc.drafts.length &&
      (!doc.pending?.draftId || doc.drafts.some((d) => d.id === doc.pending!.draftId)),
  );

type Document = z.infer<typeof documentSchema>;
type State = Document & {
  ready: boolean;
  blocked: boolean;
  busy: boolean;
  dirty: boolean;
  error: string | null;
  issue: z.infer<typeof issueSchema> | null;
};
export class TypedLibraryDraftController {
  private state: State;
  private listeners = new Set<() => void>();
  private tail: Promise<void> = Promise.resolve();
  private raw: string | null = null;
  private attemptedRaw: string | undefined;
  private sequence = 0;
  private epoch = 0;
  readonly key: string;
  constructor(
    private userId: string,
    private storage: AtomicStorage,
    private send: (
      input: PersonalMutation | TypedPersonalMutation,
    ) => Promise<PersonalMutationResult | TypedPersonalMutationResult>,
    private uuid: () => string,
  ) {
    z.uuid().parse(userId);
    this.key = `is:native-library:v1:${userId}`;
    this.state = {
      ...this.empty(),
      ready: false,
      blocked: false,
      busy: false,
      dirty: false,
      error: null,
      issue: null,
    };
  }
  private empty(): Document {
    return { version: 2, previousFormat: null, userId: this.userId, drafts: [], pending: null };
  }
  private document(): Document {
    return {
      version: 2,
      previousFormat: this.state.previousFormat,
      userId: this.userId,
      drafts: this.state.drafts,
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
  private publishDocument(doc: Document) {
    this.publish({ ...doc, issue: doc.pending?.issue ?? null });
  }
  async restore() {
    if (this.state.ready && this.state.dirty)
      throw Error("Conserva tus cambios pendientes antes de volver a leer el dispositivo.");
    const epoch = ++this.epoch;
    try {
      const raw = await this.storage.get(this.key),
        doc = raw === null ? this.empty() : this.parseStored(raw);
      if (doc.userId !== this.userId) throw Error("Identidad distinta");
      if (epoch !== this.epoch) return;
      this.raw = raw;
      this.attemptedRaw = undefined;
      this.publishDocument(doc);
      this.publish({ ready: true, blocked: false, dirty: false, error: null });
    } catch {
      if (epoch === this.epoch)
        this.publish({
          ready: true,
          blocked: true,
          error:
            "No pudimos recuperar tus rutinas locales. Se conservan; reintenta con una versión compatible.",
        });
    }
  }
  private parseStored(raw: string): Document {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && "version" in value && value.version === 1) {
      const legacy = parseLegacyLibraryDocument(value);
      return documentSchema.parse({
        ...legacy,
        version: 2,
        previousFormat: raw,
        drafts: legacy.drafts.map((d) => ({ ...d, items: d.items.map(upgradePersonalEditorItem) })),
      });
    }
    return documentSchema.parse(value);
  }
  private ensure() {
    if (!this.state.ready || this.state.blocked || this.state.busy)
      throw Error("Espera o recupera los cambios locales antes de continuar.");
  }
  private write(doc: Document): Promise<void> {
    const encoded = JSON.stringify(documentSchema.parse(doc)),
      sequence = ++this.sequence;
    this.publish({ dirty: true });
    const operation = async () => {
      const current = await this.storage.get(this.key);
      if (current !== this.raw && current !== this.attemptedRaw)
        throw new AtomicStoreError("conflict");
      this.attemptedRaw = encoded;
      await this.storage.compareAndSet(this.key, current, encoded);
      if ((await this.storage.get(this.key)) !== encoded)
        throw Error("No se verificó el guardado local.");
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
        if (sequence === this.sequence) this.publish({ dirty: false, error: null });
      },
      (error) => {
        const message =
          error instanceof AtomicStoreError && error.reason === "conflict"
            ? "Los cambios locales se modificaron en otra ventana. Conservamos tu edición en memoria; no sobrescribimos la otra versión."
            : "No pudimos guardar los cambios en este dispositivo. Revisa el espacio disponible y reintenta.";
        if (sequence === this.sequence) this.publish({ dirty: true, error: message });
        throw Error(message);
      },
    );
  }
  private async put(doc: Document) {
    this.publishDocument(doc);
    await this.write(doc);
  }
  async flush() {
    await this.tail;
    if (this.state.dirty)
      throw Error(this.state.error ?? "Quedan cambios sin guardar en este dispositivo.");
  }
  async retryStorage() {
    this.ensure();
    await this.write(this.document());
  }
  async createDraft(base?: TypedPersonalRoutine | PersonalRoutine, folderId: string | null = null) {
    this.ensure();
    const existing = base ? this.state.drafts.find((d) => d.id === base.id) : undefined;
    if (existing && (existing.changed || this.state.pending?.draftId === existing.id))
      return existing.id;
    const draft: TypedPersonalDraft = base
      ? {
          id: base.id,
          baseRevision: base.revision,
          folderId: base.folderId,
          changed: false,
          name: base.name,
          items: editableTypedPersonalItems(
            base.items.some((i) => !("prescribed" in i))
              ? upgradePersonalRoutine(base as PersonalRoutine)
              : (base as TypedPersonalRoutine),
          ),
        }
      : { id: this.uuid(), baseRevision: null, folderId, changed: true, name: "", items: [] };
    if (existing && JSON.stringify(existing) === JSON.stringify(draft)) return existing.id;
    await this.put({
      ...this.document(),
      drafts: existing
        ? this.state.drafts.map((d) => (d.id === base!.id ? draft : d))
        : [...this.state.drafts, draft],
    });
    return draft.id;
  }
  /** Protect an already reviewed, complete proposal; never replace unsaved work. */
  async stageDraft(input: TypedPersonalDraft | LegacyDraft) {
    this.ensure();
    if (this.state.pending)
      throw Error("Resuelve el intento pendiente antes de preparar otra rutina.");
    if (this.state.dirty) throw Error("Protege el borrador local pendiente antes de continuar.");
    const normalized = input.items.some((i) => !("recordType" in i))
      ? { ...input, items: (input as LegacyDraft).items.map(upgradePersonalEditorItem) }
      : input;
    const draft = draftSchema.parse({ ...normalized, changed: true });
    typedPersonalItemsInput(draft.items);
    const existing = this.state.drafts.find((d) => d.id === draft.id);
    if (existing?.changed)
      throw Error("Ya existe un borrador con cambios. Ábrelo para conservar tu edición.");
    await this.put({
      ...this.document(),
      drafts: existing
        ? this.state.drafts.map((d) => (d.id === draft.id ? draft : d))
        : [...this.state.drafts, draft],
    });
    return draft.id;
  }
  async edit(id: string, change: (draft: TypedPersonalDraft) => TypedPersonalDraft) {
    this.ensure();
    if (this.state.pending?.draftId === id)
      throw Error("Revisa el intento pendiente antes de editar de nuevo.");
    const old = this.state.drafts.find((d) => d.id === id);
    if (!old) throw Error("Ese borrador ya no está disponible.");
    const draft = draftSchema.parse({ ...change(draftSchema.parse(old)), changed: true });
    if (
      draft.id !== old.id ||
      draft.baseRevision !== old.baseRevision ||
      draft.folderId !== old.folderId
    )
      throw Error("La identidad del borrador no puede cambiar.");
    await this.put({
      ...this.document(),
      drafts: this.state.drafts.map((d) => (d.id === id ? draft : d)),
    });
  }
  async saveDraft(id: string) {
    this.ensure();
    if (this.state.pending)
      throw Error("Resuelve el intento pendiente antes de guardar otro cambio.");
    const draft = this.state.drafts.find((d) => d.id === id);
    if (!draft) throw Error("Ese borrador ya no está disponible.");
    const items = typedPersonalItemsInput(draft.items);
    const common = { version: 2 as const, requestId: this.uuid(), targetId: draft.id };
    const request = typedPersonalMutationSchema.parse(
      draft.baseRevision === null
        ? {
            ...common,
            operation: "routine_create",
            expectedRevision: 0,
            data: { name: draft.name, folderId: draft.folderId, items },
          }
        : {
            ...common,
            operation: "routine_save",
            expectedRevision: draft.baseRevision,
            data: { name: draft.name, items },
          },
    );
    return this.begin(request, id);
  }
  async mutate(input: TypedPersonalMutation) {
    this.ensure();
    if (this.state.pending) throw Error("Resuelve el intento pendiente antes de iniciar otro.");
    const request = typedPersonalMutationSchema.parse(input);
    if (request.operation.endsWith("_reorder") && request.targetId !== this.userId)
      throw Error("El orden no corresponde a esta cuenta.");
    const source = request.operation === "routine_copy" ? request.data.sourceId : null;
    if (
      this.state.drafts.some(
        (d) =>
          d.changed &&
          (d.id === request.targetId ||
            d.id === source ||
            (request.operation === "folder_delete" && d.folderId === request.targetId)),
      )
    )
      throw Error("Guarda o descarta los cambios de esa rutina antes de usar esta acción.");
    return this.begin(request, null);
  }
  private async begin(request: PersonalMutation | TypedPersonalMutation, draftId: string | null) {
    this.publish({ busy: true, error: null });
    try {
      await this.tail;
      await this.put({ ...this.document(), pending: { request, draftId, issue: null } });
      return await this.dispatch();
    } finally {
      this.publish({ busy: false });
    }
  }
  private async dispatch() {
    const pending = this.state.pending;
    if (!pending) throw Error("No hay un intento pendiente.");
    try {
      const value = await this.send(pending.request);
      const result =
        pending.request.version === 2
          ? typedPersonalMutationResultSchema.parse(value)
          : personalMutationResultSchema.strict().parse(value);
      if (
        result.requestId !== pending.request.requestId ||
        result.targetId !== pending.request.targetId
      )
        throw Error("No se confirmó este intento. Conservamos tus cambios.");
      if (result.status === "removed") {
        await this.put({ ...this.document(), pending: { ...pending, issue: "removed" } });
        throw Object.assign(Error("La rutina fue eliminada. Conservamos tu borrador."), {
          code: "removed",
        });
      }
      const clean = {
        ...this.document(),
        pending: null,
        drafts: this.state.drafts.filter((d) => d.id !== pending.draftId),
      };
      // Do not forget the frozen attempt until local cleanup is verified.
      await this.write(clean);
      this.publishDocument(clean);
      this.publish({ error: null });
      return result;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      const parsed = issueSchema.safeParse(code);
      if (parsed.success && this.state.pending) {
        const doc = { ...this.document(), pending: { ...this.state.pending, issue: parsed.data } };
        try {
          await this.put(doc);
        } catch {
          /* Preserve the attempt and dirty state if storage also fails. */
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
    if (this.state.pending?.issue)
      throw Error("Revisa la versión actual o conserva una copia antes de continuar.");
    if (!this.state.pending) throw Error("No hay un intento pendiente.");
    this.publish({ busy: true, error: null });
    try {
      await this.tail;
      await this.write(this.document());
      return await this.dispatch();
    } finally {
      this.publish({ busy: false });
    }
  }
  async forkDraft(id: string) {
    this.ensure();
    const draft = this.state.drafts.find((d) => d.id === id);
    if (!draft) throw Error("Ese borrador ya no está disponible.");
    if (this.state.pending && (!this.state.pending.issue || this.state.pending.draftId !== id))
      throw Error("Comprueba primero el intento sin confirmar.");
    const copy = {
      ...draft,
      id: this.uuid(),
      changed: true,
      baseRevision: null,
      folderId: null,
      name: draft.name.slice(0, 92) + " (copia)",
      items: forkPersonalItems(draft.items, this.uuid),
    };
    await this.put({
      ...this.document(),
      pending: null,
      drafts: this.state.drafts.map((d) => (d.id === id ? copy : d)),
    });
    return copy.id;
  }
  async discardDraft(id: string, confirmed = false) {
    this.ensure();
    if (this.state.pending?.draftId === id && !confirmed)
      throw Error("Confirma el descarte del intento pendiente.");
    await this.put({
      ...this.document(),
      drafts: this.state.drafts.filter((d) => d.id !== id),
      pending: this.state.pending?.draftId === id ? null : this.state.pending,
    });
  }
  async discardPending(confirmed = false) {
    this.ensure();
    if (!confirmed) throw Error("Confirma el descarte del intento pendiente.");
    const id = this.state.pending?.draftId;
    await this.put({
      ...this.document(),
      pending: null,
      drafts: this.state.drafts.filter((d) => d.id !== id),
    });
  }
  async clearForLogout() {
    this.ensure();
    await this.flush();
    if (this.state.drafts.some((d) => d.changed) || this.state.pending)
      throw Error("Guarda o descarta los cambios de tus rutinas antes de salir.");
    // Leave a verified empty envelope: an ordinary remove could race another window.
    await this.write(this.empty());
  }
  dispose() {
    this.epoch++;
    this.listeners.clear();
  }
}
