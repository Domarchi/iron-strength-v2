"use client";
import { ExerciseThumbnail } from "@/components/workout/exercise-thumbnail";
import { NativeSelect } from "@/components/ui/native-select";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import {
  createEditorPersistence,
  editorStorage,
  listEditorDrafts,
  type EditorDraft,
} from "@/lib/coach/editor-draft";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Copy, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  prescriptionDraft,
  validatePrescriptions,
  type CatalogExercise,
  type PrescriptionDraft,
} from "@/lib/coach/routine-editor";
import { WEEKDAYS } from "@/domain/session-schedule";
import { exerciseBlocks } from "@/domain/supersets";
import {
  groupSelected,
  separateGroup,
  separateMember,
  sessionLayout,
  type LayoutRequest,
  type LayoutRow,
} from "@/lib/coach/routine-layout";
import {
  alternativeDraft,
  validateAlternatives,
  type AlternativeDraft,
  type AlternativeRequest,
} from "@/lib/coach/routine-alternatives";
import { BulkEditor } from "./bulk-editor";
import { defaultBulkDraft, effectivePrescription, type BulkDraft } from "@/lib/coach/bulk-editor";
import type { PrescriptionField } from "@/domain/schemas";
import { AlternativesEditor } from "./alternatives-editor";
import { RoutineRestSelect } from "./routine-rest-select";
import type { SessionExerciseRow, SessionRow } from "@/lib/data/programs";
import { removeExerciseAction, removeSessionAction } from "../actions";
import { ActionForm } from "../action-form";
import {
  configureLayoutAction,
  configureAlternativesAction,
  reviewSessionAction,
  duplicateRoutineAction,
  reorderExercisesAction,
  savePrescriptionsAction,
} from "../editor-actions";
import type { AdditionRequest } from "@/lib/coach/routine-additions";
import { ExercisePicker } from "./exercise-picker";
import { useRoutineGuard } from "./week-workspace";
import { SortableExerciseList } from "./sortable-exercise-list";

type Props = {
  userId: string;
  programId: string;
  session: SessionRow;
  exercises: CatalogExercise[];
  canDuplicateSession?: boolean;
};
const subscribeHydration = () => () => {};
export function SessionEditor(props: Props) {
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  return hydrated ? (
    <Editor
      key={restoreId ?? "current"}
      {...props}
      restoreId={restoreId}
      onRestore={setRestoreId}
    />
  ) : (
    <Card>
      <CardContent className="p-4">Cargando editor…</CardContent>
    </Card>
  );
}
function Editor({
  userId,
  programId,
  session: serverSession,
  exercises,
  canDuplicateSession = true,
  restoreId,
  onRestore,
}: Props & { restoreId: string | null; onRestore: (id: string) => void }) {
  const [recovered] = useState(() =>
    listEditorDrafts(editorStorage(), userId, programId, serverSession.id),
  );
  const pointerKey = `is:coach-editor-tab:${userId}:${programId}:${serverSession.id}`;
  const [pointer] = useState(() => {
    try {
      return sessionStorage.getItem(pointerKey);
    } catch {
      return null;
    }
  });
  const [restored] = useState(() =>
    restoreId
      ? (recovered.find((d) => d.id === restoreId) ?? null)
      : pointer === "cleared"
        ? null
        : (recovered.find((d) => d.id === pointer) ?? recovered[0] ?? null),
  );
  const ownsSource = pointer === restored?.id;
  function remember(id: string) {
    try {
      sessionStorage.setItem(pointerKey, id);
    } catch {
      /* Los datos siguen en localStorage. */
    }
  }
  const [localId] = useState(() => crypto.randomUUID());
  const sourceDraft = useRef(restored);
  const [persistence] = useState(() => createEditorPersistence(editorStorage));
  const storageStatus = useSyncExternalStore(
    persistence.subscribe,
    persistence.getSnapshot,
    () => "clean",
  );
  const [additionRequest, setAdditionRequest] = useState<AdditionRequest | null>(
    restored?.additionRequest ?? null,
  );
  const [additionSelection, setAdditionSelection] = useState<string[]>(
    restored?.additionSelection ?? restored?.additionRequest?.items.map((i) => i.exerciseId) ?? [],
  );
  const [review, setReview] = useState<SessionRow | null>(null);
  const session = review ?? serverSession;
  const router = useRouter();
  const baseRevision = useRef<number | null>(restored?.revision ?? null);
  const [saveRequest, setSaveRequest] = useState<{
    id: string;
    revision: number;
    rows: PrescriptionDraft[];
    title?: string;
    weekday?: number;
  } | null>(restored?.saveRequest ?? null);
  const [orderRequest, setOrderRequest] = useState<{ id: string; revision: number } | null>(
    restored?.orderRequest ?? null,
  );
  const [conflict, setConflict] = useState(
    !!restored &&
      restored.revision !== session.revision &&
      !restored.saveRequest &&
      !restored.orderRequest &&
      !restored.copyRequest &&
      !restored.layoutRequest &&
      !restored.alternativeRequest &&
      !restored.additionRequest,
  );
  const [weekday, setWeekday] = useState<number | undefined>(restored?.weekday);
  const [title, setTitle] = useState<string | undefined>(restored?.title);
  const [edits, setEdits] = useState<Record<string, PrescriptionDraft>>(restored?.edits ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useRoutineGuard();
  const [order, setOrder] = useState<string[] | null>(restored?.order ?? null);
  const [dragging, setDragging] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(
    restored?.orderRequest ? "Orden pendiente de confirmar tras recuperar el borrador." : null,
  );
  const [copyRequest, setCopyRequest] = useState<{ id: string; exerciseId?: string } | null>(
    restored?.copyRequest ?? null,
  );
  const [bulk, setBulk] = useState<BulkDraft | null>(restored?.bulk ?? null);
  const [selected, setSelected] = useState<string[]>(restored?.bulk?.ids ?? []);
  const bulkKey = `${session.id}-bulk`;
  const [layoutRequest, setLayoutRequest] = useState<LayoutRequest | null>(
    restored?.layoutRequest ?? null,
  );
  const [layoutError, setLayoutError] = useState<string | null>(
    restored?.layoutRequest ? "Configuración pendiente de confirmar." : null,
  );
  const [alternativeEdits, setAlternativeEdits] = useState<Record<string, AlternativeDraft[]>>(
    restored?.alternativeEdits ?? {},
  );
  const [alternativeRequest, setAlternativeRequest] = useState<AlternativeRequest | null>(
    restored?.alternativeRequest ?? null,
  );
  const [alternativeError, setAlternativeError] = useState<string | null>(null);
  const alternativesDirty = Object.keys(alternativeEdits).length > 0 || !!alternativeRequest;
  const alternativesKey = `${session.id}-alternatives`;
  const layoutKey = `${session.id}-layout`;
  const selectionKey = `${session.id}-selection`;
  const [copyError, setCopyError] = useState<string | null>(
    restored?.copyRequest ? "Copia pendiente de confirmar tras recuperar el borrador." : null,
  );
  const copyKey = `${session.id}-copy`;
  const orderKey = `${session.id}-order`;
  const dragKey = `${session.id}-drag`;
  const orderedExercises = order
    ? [...session.exercises].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    : session.exercises;
  const orderPending = order !== null;
  const blocks = exerciseBlocks(orderedExercises);
  const layout = sessionLayout(orderedExercises);
  const dragDisabled =
    pending ||
    orderPending ||
    conflict ||
    !!saveRequest ||
    !!additionRequest ||
    !!layoutRequest ||
    alternativesDirty ||
    guard.dirtyIds.some((id) => id !== orderKey && id !== dragKey);
  const drafts = orderedExercises.map((row) => effectivePrescription(row, edits[row.id]));
  const changed = drafts.filter(
    (draft, index) =>
      JSON.stringify(draft) !== JSON.stringify(prescriptionDraft(orderedExercises[index])),
  );
  const orphanEdits = Object.values(edits).filter(
    (row) => !session.exercises.some((e) => e.id === row.id),
  );
  const dirty =
    title !== undefined ||
    weekday !== undefined ||
    changed.length > 0 ||
    orphanEdits.length > 0 ||
    !!saveRequest;
  const totalSets = drafts.reduce(
    (sum, row) => sum + (/^\d+$/.test(row.sets) ? Number(row.sets) : 0),
    0,
  );
  const structuralDisabled =
    pending ||
    guard.dirty ||
    dragging ||
    conflict ||
    !!saveRequest ||
    !!additionRequest ||
    !!layoutRequest ||
    alternativesDirty;
  const layoutDisabled =
    pending ||
    dirty ||
    orderPending ||
    dragging ||
    conflict ||
    !!saveRequest ||
    !!additionRequest ||
    !!copyRequest ||
    !!layoutRequest ||
    alternativesDirty ||
    guard.dirtyIds.some((id) => id !== selectionKey && id !== bulkKey);
  const lastDraft = useRef<EditorDraft | null>(restored ? { ...restored, id: localId } : null);
  function persistLocal(overrides: Partial<EditorDraft> = {}) {
    const next: EditorDraft = {
      version: 2,
      id: localId,
      userId,
      programId,
      sessionId: session.id,
      revision: baseRevision.current ?? session.revision,
      updatedAt: new Date().toISOString(),
      edits,
      title,
      weekday,
      bulk,
      order,
      orderRequest,
      saveRequest,
      copyRequest,
      layoutRequest,
      alternativeEdits,
      alternativeRequest,
      additionRequest,
      additionSelection,
      ...overrides,
    };
    lastDraft.current = next;
    if (
      next.additionRequest ||
      next.additionSelection?.length ||
      next.bulk ||
      next.title !== undefined ||
      next.weekday !== undefined ||
      Object.keys(next.edits).length ||
      next.order ||
      next.saveRequest ||
      next.copyRequest ||
      next.layoutRequest ||
      Object.keys(next.alternativeEdits ?? {}).length ||
      next.alternativeRequest
    ) {
      if (persistence.persist(next)) {
        remember(localId);
        if (sourceDraft.current && ownsSource) {
          persistence.remove(sourceDraft.current, true, true);
          sourceDraft.current = null;
        }
        return true;
      }
      return false;
    } else {
      const removed = persistence.remove(next);
      remember("cleared");
      return removed;
    }
  }
  function removeRecovered() {
    if (sourceDraft.current) persistence.remove(sourceDraft.current, true, true);
    sourceDraft.current = null;
  }
  const setGuardDirty = guard.setDirty;
  useEffect(() => {
    if (!restored) return;
    persistence.restored();
    setGuardDirty(
      serverSession.id,
      restored.title !== undefined ||
        restored.weekday !== undefined ||
        Object.keys(restored.edits).length > 0 ||
        !!restored.saveRequest,
    );
    setGuardDirty(
      `${serverSession.id}-picker`,
      !!restored.additionRequest || !!restored.additionSelection?.length,
    );
    setGuardDirty(`${serverSession.id}-bulk`, !!restored.bulk);
    setGuardDirty(`${serverSession.id}-selection`, !!restored.bulk?.ids.length);
    setGuardDirty(`${serverSession.id}-order`, !!restored.order);
    setGuardDirty(`${serverSession.id}-copy`, !!restored.copyRequest);
    setGuardDirty(`${serverSession.id}-layout`, !!restored.layoutRequest);
    setGuardDirty(
      `${serverSession.id}-alternatives`,
      !!restored.alternativeRequest || !!Object.keys(restored.alternativeEdits ?? {}).length,
    );
  }, [restored, persistence, serverSession.id, setGuardDirty]);
  function changeAlternatives(rowId: string, rows: AlternativeDraft[]) {
    baseRevision.current ??= session.revision;
    const next = { ...alternativeEdits, [rowId]: rows };
    setAlternativeEdits(next);
    setAlternativeError(null);
    guard.setDirty(alternativesKey, true);
    persistLocal({ alternativeEdits: next });
  }
  function saveAlternatives(row: SessionExerciseRow) {
    const parsed = validateAlternatives(row.exerciseId, alternativeEdits[row.id] ?? []);
    if (!parsed.ok) {
      setAlternativeError(parsed.error);
      return;
    }
    const request = alternativeRequest ?? {
      id: crypto.randomUUID(),
      revision: baseRevision.current ?? session.revision,
      exerciseRowId: row.id,
      alternatives: parsed.rows,
    };
    setAlternativeRequest(request);
    persistLocal({ alternativeRequest: request });
    setAlternativeError(null);
    setStatus(null);
    startTransition(async () => {
      try {
        const result = await configureAlternativesAction(programId, session.id, request);
        if (result.error) {
          setAlternativeError(result.error);
          if (!result.uncertain) {
            setAlternativeRequest(null);
            persistLocal({ alternativeRequest: null });
          }
          if (result.conflict) setConflict(true);
          return;
        }
        setAlternativeEdits({});
        setAlternativeRequest(null);
        setConflict(false);
        setReview(null);
        baseRevision.current = null;
        guard.setDirty(alternativesKey, false);
        persistLocal({ alternativeEdits: {}, alternativeRequest: null });
        removeRecovered();
        setStatus("Alternativas guardadas.");
      } catch {
        setAlternativeError(
          "No se pudo confirmar el guardado. Reintenta para confirmar la misma operación.",
        );
      }
    });
  }
  function discardAlternatives() {
    setAlternativeEdits({});
    setAlternativeRequest(null);
    setAlternativeError(null);
    setConflict(false);
    setReview(null);
    baseRevision.current = null;
    guard.setDirty(alternativesKey, false);
    persistLocal({ alternativeEdits: {}, alternativeRequest: null });
    removeRecovered();
    router.refresh();
  }
  function configure(next: LayoutRow[], savedRequest?: LayoutRequest) {
    const request = savedRequest ?? {
      id: crypto.randomUUID(),
      revision: session.revision,
      layout: next,
    };
    persistLocal({ layoutRequest: request });
    setLayoutRequest(request);
    setLayoutError(null);
    setStatus(null);
    guard.setDirty(layoutKey, true);
    startTransition(async () => {
      try {
        const result = await configureLayoutAction(programId, session.id, request);
        if (result.error) {
          setLayoutError(result.error);
          return;
        }
        baseRevision.current = null;
        setConflict(false);
        setLayoutRequest(null);
        setSelected([]);
        setReview(null);
        persistLocal({ layoutRequest: null });
        removeRecovered();
        guard.setDirty(layoutKey, false);
        guard.setDirty(selectionKey, false);
        setStatus("Configuración guardada.");
      } catch {
        setLayoutError(
          "No se pudo confirmar la configuración. Reintenta sin repetir la operación.",
        );
      }
    });
  }
  function selectGroup(id: string) {
    const next = selected.includes(id)
      ? selected.filter((value) => value !== id)
      : [...selected, id];
    setSelected(next);
    if (bulk) {
      const nextBulk = next.length ? { ...bulk, ids: next } : null;
      setBulk(nextBulk);
      persistLocal({ bulk: nextBulk });
      guard.setDirty(bulkKey, !!nextBulk);
    }
    guard.setDirty(selectionKey, next.length > 0);
  }
  function cancelSelection() {
    setSelected([]);
    setBulk(null);
    persistLocal({ bulk: null });
    guard.setDirty(selectionKey, false);
    guard.setDirty(bulkKey, false);
    if (!dirty) {
      baseRevision.current = null;
      setConflict(false);
      setReview(null);
      router.refresh();
    }
  }
  function changeBulk(next: BulkDraft) {
    if (baseRevision.current === null) baseRevision.current = session.revision;
    setBulk(next);
    persistLocal({ bulk: next });
    guard.setDirty(bulkKey, true);
    setStatus(null);
  }
  function applyBulk(rows: PrescriptionDraft[]) {
    const next = { ...edits, ...Object.fromEntries(rows.map((row) => [row.id, row])) };
    setEdits(next);
    setBulk(null);
    setSelected([]);
    persistLocal({ edits: next, bulk: null });
    guard.setDirty(bulkKey, false);
    guard.setDirty(selectionKey, false);
    guard.setDirty(session.id, true);
    setErrors({});
    setError(null);
    setStatus("Lote aplicado al borrador. Guarda la sesión.");
  }
  function moveBlock(id: string, delta: number) {
    const ids = blocks.map((block) => block.id),
      index = ids.indexOf(id);
    if (index < 0 || index + delta < 0 || index + delta >= ids.length) return;
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    reorder(
      ids.flatMap((key) =>
        blocks.find((block) => block.id === key)!.exercises.map((exercise) => exercise.id),
      ),
    );
  }
  function reviewCurrent() {
    startTransition(async () => {
      try {
        const current = await reviewSessionAction(programId, session.id);
        if (!current) {
          setError("La sesión ya no existe. Tu borrador permanece en este dispositivo.");
          return;
        }
        setReview(current);
        setConflict(true);
      } catch {
        setError("No se pudo cargar la versión actual. Tus cambios se conservan.");
      }
    });
  }
  function duplicate(request: { id: string; exerciseId?: string }) {
    persistLocal({ copyRequest: request });
    setCopyRequest(request);
    setCopyError(null);
    setStatus(null);
    guard.setDirty(copyKey, true);
    const fd = new FormData();
    fd.set("programId", programId);
    fd.set("sessionId", session.id);
    fd.set("copyId", request.id);
    if (request.exerciseId) fd.set("exerciseId", request.exerciseId);
    startTransition(async () => {
      try {
        const result = await duplicateRoutineAction(fd);
        setCopyError(result.error);
        if (!result.uncertain) {
          persistLocal({ copyRequest: null });
          if (!result.error) removeRecovered();
          setCopyRequest(null);
          guard.setDirty(copyKey, false);
        }
        if (!result.error) {
          baseRevision.current = null;
          setConflict(false);
        }
        if (!result.error)
          setStatus(request.exerciseId ? "Ejercicio duplicado." : "Sesión duplicada.");
      } catch {
        setCopyError(
          "No se pudo confirmar la copia. Reintenta para comprobarla sin crear duplicados.",
        );
      }
    });
  }
  function reorder(ids: string[]) {
    const request = orderRequest ?? { id: crypto.randomUUID(), revision: session.revision };
    persistLocal({ order: ids, orderRequest: request });
    setOrderRequest(request);
    setOrder(ids);
    setOrderError(null);
    setStatus(null);
    guard.setDirty(orderKey, true);
    const fd = new FormData();
    fd.set("programId", programId);
    fd.set("sessionId", session.id);
    fd.set("orderedIds", JSON.stringify(ids));
    fd.set("requestId", request.id);
    fd.set("revision", String(request.revision));
    startTransition(async () => {
      try {
        const result = await reorderExercisesAction(fd);
        if (result.error) {
          setOrderError(result.error);
          setConflict(result.conflict ?? false);
        } else {
          baseRevision.current = null;
          setConflict(false);
          persistLocal({ order: null, orderRequest: null });
          removeRecovered();
          setOrder(null);
          setOrderRequest(null);
          guard.setDirty(orderKey, false);
          setStatus("Orden guardado.");
        }
      } catch {
        setOrderError(
          "No se pudo confirmar el orden. Conservamos tu orden aquí; vuelve a intentar.",
        );
      }
    });
  }
  function change(draft: PrescriptionDraft, field: PrescriptionField, value: string) {
    baseRevision.current ??= session.revision;
    const updated = {
      ...draft,
      [field]: value,
      ...(draft.fields ? { fields: [...new Set([...draft.fields, field])] } : {}),
    };
    const next = { ...edits, [draft.id]: updated };
    const original = session.exercises.find((e) => e.id === draft.id);
    if (original && JSON.stringify(next[draft.id]) === JSON.stringify(prescriptionDraft(original)))
      delete next[draft.id];
    if (!Object.keys(next).length && title === undefined && weekday === undefined && !bulk)
      baseRevision.current = null;
    persistLocal({ edits: next });
    setEdits(next);
    setErrors((old) => ({ ...old, [draft.id]: "" }));
    setError(null);
    setStatus(null);
    guard.setDirty(
      session.id,
      title !== undefined ||
        weekday !== undefined ||
        session.exercises.some(
          (row) =>
            next[row.id] && JSON.stringify(next[row.id]) !== JSON.stringify(prescriptionDraft(row)),
        ),
    );
  }
  function save() {
    const request = saveRequest ?? {
      id: crypto.randomUUID(),
      revision: baseRevision.current ?? session.revision,
      rows: changed,
      ...(title !== undefined ? { title } : {}),
      ...(weekday !== undefined ? { weekday } : {}),
    };
    const validation =
      request.rows.length === 0 && (request.title !== undefined || request.weekday !== undefined)
        ? { rows: [], errors: {}, error: null }
        : validatePrescriptions(request.rows);
    setErrors(validation.errors);
    setError(validation.error);
    setStatus(null);
    if (validation.error) return;
    const fd = new FormData();
    fd.set("programId", programId);
    fd.set("sessionId", session.id);
    persistLocal({ saveRequest: request });
    setSaveRequest(request);
    fd.set("rows", JSON.stringify(request.rows));
    if (request.title !== undefined) fd.set("title", request.title);
    if (request.weekday !== undefined) fd.set("weekday", String(request.weekday));
    fd.set("requestId", request.id);
    fd.set("revision", String(request.revision));
    startTransition(async () => {
      try {
        const result = await savePrescriptionsAction(fd);
        setConflict(result.conflict ?? false);
        if (!result.uncertain) setSaveRequest(null);
        if (!result.error) baseRevision.current = null;
        const nextEdits = Object.fromEntries(
          Object.entries(edits).filter(([id]) => !result.savedIds.includes(id)),
        );
        persistLocal({
          edits: nextEdits,
          title: result.error ? title : undefined,
          weekday: result.error ? weekday : undefined,
          saveRequest: result.uncertain ? request : null,
          revision: result.error ? request.revision : (result.revision ?? session.revision),
        });
        if (!result.error) removeRecovered();
        if (!result.error) setReview(null);
        setEdits(nextEdits);
        if (!result.error) {
          setTitle(undefined);
          setWeekday(undefined);
        }
        const remaining = changed.filter((row) => !result.savedIds.includes(row.id));
        guard.setDirty(
          session.id,
          remaining.length > 0 ||
            !!result.uncertain ||
            (!!result.error && (request.title !== undefined || request.weekday !== undefined)),
        );
        setError(result.error);
        setStatus(
          result.savedIds.length ||
            (!result.error && (request.title !== undefined || request.weekday !== undefined))
            ? remaining.length
              ? `${result.savedIds.length} cambios guardados; ${remaining.length} pendientes.`
              : "Cambios guardados."
            : null,
        );
      } catch {
        setError(
          "No se pudieron confirmar los cambios. Se conservan aquí; vuelve a intentar guardar.",
        );
      }
    });
  }
  function renderExercise(exercise: SessionExerciseRow, index: number, handle: ReactNode) {
    const draft = drafts[index];
    const modified = changed.some((row) => row.id === draft.id);
    const errorId = `error-${exercise.id}`;
    return (
      <div
        key={exercise.id}
        className={`coach-exercise-row rounded-md border p-3 ${modified ? "border-primary/40 bg-primary/5" : "bg-background"}`}
      >
        <div className="coach-row-identity flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {handle}
            <ExerciseThumbnail name={exercise.name} />
            <div className="min-w-0">
              <h4 className="text-sm font-semibold">
                <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                {exercise.name}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {exercise.muscleGroup}
                {exercise.equipment ? ` · ${exercise.equipment}` : ""}
                {exercise.archived ? " · Archivado" : ""}
              </p>
            </div>
          </div>
          <div className="coach-row-actions flex w-full shrink-0 justify-end gap-0.5 sm:w-auto">
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Duplicar ${exercise.name}`}
              disabled={structuralDisabled || session.exercises.length >= 15 || exercise.archived}
              onClick={() => duplicate({ id: crypto.randomUUID(), exerciseId: exercise.id })}
            >
              <Copy aria-hidden />
            </Button>
            {(
              [
                [-1, "Subir", ArrowUp],
                [1, "Bajar", ArrowDown],
              ] as const
            ).map(([delta, label, ControlIcon]) => {
              return (
                <Button
                  key={delta}
                  size="icon"
                  variant="ghost"
                  aria-label={`${label} ${exercise.name}`}
                  disabled={
                    structuralDisabled ||
                    index + delta < 0 ||
                    index + delta >= orderedExercises.length ||
                    (!!exercise.supersetId &&
                      orderedExercises[index + delta]?.supersetId !== exercise.supersetId)
                  }
                  onClick={() => {
                    if (!exercise.supersetId) {
                      moveBlock(exercise.id, delta);
                      return;
                    }
                    const ids = orderedExercises.map((e) => e.id);
                    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
                    reorder(ids);
                  }}
                >
                  <ControlIcon aria-hidden />
                </Button>
              );
            })}
            <ActionForm
              action={removeExerciseAction}
              fields={{ id: exercise.id, programId }}
              label={<Trash2 aria-hidden />}
              ariaLabel={`Quitar ${exercise.name}`}
              confirm={`¿Quitar ${exercise.name} de esta sesión?`}
              disabled={structuralDisabled}
              size="icon"
              variant="ghost"
            />
          </div>
        </div>
        <div className="coach-row-selection mt-2 flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="size-11 accent-primary"
              aria-label={`Seleccionar ${exercise.name}`}
              checked={selected.includes(exercise.id)}
              disabled={layoutDisabled}
              onChange={() => selectGroup(exercise.id)}
            />
            Seleccionar
          </label>
          {exercise.supersetId ? (
            <Button
              variant="ghost"
              disabled={structuralDisabled}
              aria-label={`Sacar ${exercise.name} de superserie`}
              onClick={() => configure(separateMember(layout, exercise.id))}
            >
              Sacar de superserie
            </Button>
          ) : (
            <>
              <RoutineRestSelect
                label={`Descanso de ${exercise.name}`}
                value={exercise.restSeconds ?? null}
                disabled={structuralDisabled}
                onChange={(value) =>
                  configure(
                    layout.map((row) =>
                      row.id === exercise.id ? { ...row, restSeconds: value } : row,
                    ),
                  )
                }
              />
            </>
          )}
        </div>
        <fieldset
          disabled={
            pending ||
            orderPending ||
            dragging ||
            !!copyRequest ||
            !!saveRequest ||
            !!additionRequest ||
            !!layoutRequest ||
            alternativesDirty ||
            selected.length > 0
          }
          className="coach-prescription mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {(
            [
              ["sets", "Series", "numeric", 1, 10],
              ["repsMin", "Reps mín.", "numeric", 1, 100],
              ["repsMax", "Reps máx.", "numeric", 1, 100],
              ["targetWeightKg", "Peso (kg)", "decimal", undefined, undefined],
            ] as const
          ).map(([field, label, inputMode, min, max]) => (
            <label
              key={field}
              className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground"
            >
              {label}
              <Input
                aria-label={`${label} de ${exercise.name}`}
                aria-invalid={!!errors[exercise.id]}
                aria-describedby={errors[exercise.id] ? errorId : undefined}
                type={inputMode === "numeric" ? "number" : "text"}
                inputMode={inputMode}
                min={min}
                max={max}
                placeholder={field === "targetWeightKg" ? "Libre" : undefined}
                value={draft[field]}
                onChange={(e) => change(draft, field, e.target.value)}
                className="h-11 min-w-0 bg-background text-base font-medium tabular-nums text-foreground"
              />
            </label>
          ))}
        </fieldset>
        <details className="coach-row-note mt-2" open={draft.note ? true : undefined}>
          <summary className="min-h-11 cursor-pointer py-3 text-xs text-muted-foreground">
            Nota del ejercicio{draft.note ? "" : " (opcional)"}
          </summary>
          <Input
            aria-label={`Nota de ${exercise.name}`}
            value={draft.note}
            maxLength={500}
            disabled={
              pending ||
              orderPending ||
              dragging ||
              !!copyRequest ||
              !!saveRequest ||
              !!additionRequest ||
              !!layoutRequest ||
              alternativesDirty ||
              selected.length > 0
            }
            onChange={(e) => change(draft, "note", e.target.value)}
            placeholder="Técnica, tempo o indicaciones"
            className="h-11 bg-background"
          />
        </details>
        <AlternativesEditor
          name={exercise.name}
          originalId={exercise.exerciseId}
          rows={
            alternativeEdits[exercise.id] ?? (exercise.alternatives ?? []).map(alternativeDraft)
          }
          catalog={exercises}
          dirty={
            !!alternativeEdits[exercise.id] || alternativeRequest?.exerciseRowId === exercise.id
          }
          disabled={
            pending ||
            conflict ||
            dirty ||
            orderPending ||
            dragging ||
            !!saveRequest ||
            !!additionRequest ||
            !!copyRequest ||
            !!layoutRequest ||
            selected.length > 0 ||
            guard.dirtyIds.some((id) => id !== alternativesKey) ||
            (alternativesDirty && !alternativeEdits[exercise.id])
          }
          locked={!!alternativeRequest}
          saving={pending}
          onChange={(rows) => changeAlternatives(exercise.id, rows)}
          onSave={() => saveAlternatives(exercise)}
          onDiscard={discardAlternatives}
        />
        {errors[exercise.id] ? (
          <p id={errorId} role="alert" className="mt-2 text-sm text-destructive">
            {errors[exercise.id]}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <Card className="coach-session" id={`session-${session.id}`}>
      <CardHeader className="border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base" role="heading" aria-level={3}>
              Sesión {session.label}
              {session.title ? ` · ${session.title}` : ""}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {session.exercises.length} ejercicios · {totalSets} series
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            <Button
              variant="outline"
              disabled={structuralDisabled || !canDuplicateSession}
              onClick={() => duplicate({ id: crypto.randomUUID() })}
              aria-label={`Duplicar sesión ${session.label}`}
            >
              <Copy aria-hidden /> Duplicar sesión
            </Button>
            <ActionForm
              action={removeSessionAction}
              fields={{ sessionId: session.id, programId }}
              label={<Trash2 aria-hidden />}
              ariaLabel={`Quitar la sesión ${session.label} de la semana ${session.weekNumber}`}
              confirm={`¿Quitar la sesión ${session.label} y sus ejercicios?`}
              size="icon"
              variant="ghost"
              disabled={structuralDisabled}
            />
          </div>
        </div>
        <label className="mt-3 block text-sm font-medium">
          Nombre de sesión {session.label}
          <Input
            value={title ?? session.title ?? ""}
            maxLength={80}
            placeholder="Por ejemplo, Tren superior"
            disabled={
              pending ||
              orderPending ||
              dragging ||
              conflict ||
              !!saveRequest ||
              !!additionRequest ||
              !!copyRequest ||
              !!layoutRequest ||
              alternativesDirty ||
              selected.length > 0
            }
            onChange={(event) => {
              const next =
                event.target.value === (session.title ?? "") ? undefined : event.target.value;
              if (baseRevision.current === null) baseRevision.current = session.revision;
              setTitle(next);
              persistLocal({ title: next });
              setStatus(null);
              setError(null);
              guard.setDirty(
                session.id,
                next !== undefined ||
                  weekday !== undefined ||
                  changed.length > 0 ||
                  orphanEdits.length > 0,
              );
            }}
          />
        </label>
        <label className="mt-3 flex flex-col gap-1 text-sm font-medium">
          Día orientativo de sesión {session.label}
          <NativeSelect
            aria-label={`Día orientativo de sesión ${session.label}`}
            aria-describedby={`day-hint-${session.id}`}

            value={weekday ?? session.weekday ?? -1}
            disabled={
              pending ||
              orderPending ||
              dragging ||
              conflict ||
              !!saveRequest ||
              !!additionRequest ||
              !!copyRequest ||
              !!layoutRequest ||
              alternativesDirty ||
              selected.length > 0
            }
            onChange={(event) => {
              const value = Number(event.target.value);
              const next = value === (session.weekday ?? -1) ? undefined : value;
              baseRevision.current ??= session.revision;
              setWeekday(next);
              persistLocal({ weekday: next });
              setStatus(null);
              setError(null);
              guard.setDirty(
                session.id,
                next !== undefined ||
                  title !== undefined ||
                  changed.length > 0 ||
                  orphanEdits.length > 0,
              );
            }}
          >
            <option value={-1}>Sin día sugerido</option>
            {WEEKDAYS.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </NativeSelect>
        </label>
        <p id={`day-hint-${session.id}`} className="mt-1 text-xs text-muted-foreground">
          El alumno puede moverlo dentro de su semana.
        </p>
      </CardHeader>
      <CardContent className="coach-session-content flex flex-col gap-4">
        {!session.exercises.length ? (
          <div className="rounded-md border border-dashed p-5 text-center">
            <p className="text-sm font-medium">Arma esta sesión</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Elige varios ejercicios y ajusta sus series en un solo lugar.
            </p>
          </div>
        ) : null}
        {session.exercises.length > 1 ? (
          <p className="text-xs text-muted-foreground">
            Arrastra desde el asa para reordenar. El orden se guarda al soltar.
          </p>
        ) : null}
        {selected.length ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
            <Button
              disabled={layoutDisabled || !!bulk || !groupSelected(layout, selected, "preview")}
              onClick={() => {
                const next = groupSelected(layout, selected, crypto.randomUUID());
                if (next) configure(next);
              }}
            >
              Agrupar seleccionados ({selected.length})
            </Button>
            <Button variant="ghost" disabled={pending || !!layoutRequest} onClick={cancelSelection}>
              Cancelar selección
            </Button>
            <p className="text-xs text-muted-foreground">
              Para agrupar, selecciona de dos a cuatro ejercicios consecutivos. Para editar, puedes
              elegir hasta 15.
            </p>
          </div>
        ) : null}
        {selected.length ? (
          <BulkEditor
            rows={session.exercises}
            value={bulk ?? defaultBulkDraft(selected)}
            disabled={pending || conflict || !!saveRequest || !!layoutRequest}
            onChange={changeBulk}
            onApply={applyBulk}
            onCancel={cancelSelection}
          />
        ) : null}
        {layoutError ? (
          <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
            <p>{layoutError}</p>
            {layoutRequest ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  disabled={pending}
                  onClick={() => configure(layoutRequest.layout, layoutRequest)}
                >
                  Reintentar configuración
                </Button>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        "¿Descartar la configuración pendiente y cargar la versión actual?",
                      )
                    )
                      return;
                    setLayoutRequest(null);
                    setLayoutError(null);
                    setSelected([]);
                    setReview(null);
                    persistLocal({ layoutRequest: null });
                    removeRecovered();
                    guard.setDirty(layoutKey, false);
                    guard.setDirty(selectionKey, false);
                    router.refresh();
                  }}
                >
                  Descartar configuración
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        <SortableExerciseList
          items={blocks}
          disabled={dragDisabled}
          onReorder={(ids) =>
            reorder(
              ids.flatMap((id) =>
                blocks.find((block) => block.id === id)!.exercises.map((exercise) => exercise.id),
              ),
            )
          }
          onBusyChange={(value) => {
            setDragging(value);
            guard.setDirty(dragKey, value);
          }}
        >
          {(block, blockIndex, handle) => (
            <div
              className={
                block.supersetId
                  ? "space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-2"
                  : ""
              }
            >
              {block.supersetId ? (
                <div className="flex flex-wrap items-center justify-between gap-2 p-1">
                  <div className="flex items-center gap-1">
                    {handle}
                    <h4 className="text-sm font-semibold">{block.name}</h4>
                  </div>
                  <RoutineRestSelect
                    label={`Descanso de ${block.name}`}
                    value={block.exercises[0].supersetRestSeconds ?? null}
                    disabled={structuralDisabled}
                    onChange={(value) =>
                      configure(
                        layout.map((row) =>
                          row.supersetId === block.supersetId
                            ? { ...row, supersetRestSeconds: value }
                            : row,
                        ),
                      )
                    }
                  />
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="ghost"
                      disabled={structuralDisabled || blockIndex === 0}
                      aria-label={`Subir ${block.name}`}
                      onClick={() => moveBlock(block.id, -1)}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={structuralDisabled || blockIndex === blocks.length - 1}
                      aria-label={`Bajar ${block.name}`}
                      onClick={() => moveBlock(block.id, 1)}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button
                      variant="outline"
                      disabled={structuralDisabled}
                      onClick={() => configure(separateGroup(layout, block.supersetId!))}
                    >
                      Separar {block.name}
                    </Button>
                  </div>
                </div>
              ) : null}
              {block.exercises.map((exercise) =>
                renderExercise(
                  exercise,
                  orderedExercises.indexOf(exercise),
                  block.supersetId ? null : handle,
                ),
              )}
            </div>
          )}
        </SortableExerciseList>
        {copyError ? (
          <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
            <p>{copyError}</p>
            {copyRequest ? (
              <Button className="mt-2" disabled={pending} onClick={() => duplicate(copyRequest)}>
                Reintentar copia
              </Button>
            ) : null}
          </div>
        ) : null}
        {pending && copyRequest ? (
          <p role="status" className="text-sm text-muted-foreground">
            Creando copia…
          </p>
        ) : null}
        {orderError ? (
          <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
            <p>{orderError}</p>
            <p className="mt-1 text-muted-foreground">
              El orden mostrado sigue pendiente de confirmar.
            </p>
            <Button
              className="mt-2"
              disabled={pending || conflict}
              onClick={() => order && reorder(order)}
            >
              Reintentar guardar orden
            </Button>
          </div>
        ) : null}
        {pending && orderPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Guardando orden…
          </p>
        ) : null}
        {session.exercises.length || dirty ? (
          <div className="coach-save-bar flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 p-3">
            <div className="text-xs">
              <p className="font-medium">
                {dirty
                  ? `${changed.length} ejercicios con cambios${title !== undefined ? " · título pendiente" : ""}${weekday !== undefined ? " · día pendiente" : ""}`
                  : "Prescripción al día"}
              </p>
              <p className="mt-1 text-muted-foreground">
                {dirty
                  ? "Guarda para reordenar o agregar ejercicios."
                  : "Edita los valores y guarda la sesión."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {dirty ? (
                <Button
                  variant="ghost"
                  disabled={
                    pending ||
                    orderPending ||
                    dragging ||
                    !!saveRequest ||
                    !!additionRequest ||
                    !!layoutRequest ||
                    alternativesDirty ||
                    selected.length > 0
                  }
                  onClick={() => {
                    if (window.confirm("¿Descartar los cambios sin guardar de esta sesión?")) {
                      persistLocal({
                        edits: {},
                        title: undefined,
                        weekday: undefined,
                        saveRequest: null,
                      });
                      setTitle(undefined);
                      setWeekday(undefined);
                      removeRecovered();
                      baseRevision.current = null;
                      setConflict(false);
                      setReview(null);
                      router.refresh();
                      setEdits({});
                      setErrors({});
                      setError(null);
                      setStatus(null);
                      guard.setDirty(session.id, false);
                    }
                  }}
                >
                  Descartar cambios
                </Button>
              ) : null}
              <Button
                disabled={
                  !dirty ||
                  pending ||
                  orderPending ||
                  dragging ||
                  !!copyRequest ||
                  conflict ||
                  !!layoutRequest ||
                  alternativesDirty ||
                  selected.length > 0
                }
                onClick={save}
              >
                <Save aria-hidden />
                {pending ? "Guardando…" : "Guardar sesión"}
              </Button>
            </div>
          </div>
        ) : null}
        {status && !pending ? (
          <p role="status" className="flex items-center gap-2 text-sm text-success">
            <Check className="size-4" aria-hidden />
            {status}
          </p>
        ) : null}
        {conflict && orderPending ? (
          <Button
            variant="outline"
            onClick={() => {
              if (!window.confirm("¿Descartar este orden y cargar la sesión actual?")) return;
              persistLocal({ order: null, orderRequest: null });
              removeRecovered();
              setOrder(null);
              setOrderRequest(null);
              setOrderError(null);
              setConflict(false);
              guard.setDirty(orderKey, false);
              router.refresh();
            }}
          >
            Descartar orden y cargar versión actual
          </Button>
        ) : null}
        {storageStatus === "error" ? (
          <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
            <p>No se pudo guardar en este dispositivo. Mantén esta página abierta.</p>
            <Button
              className="mt-2"
              variant="outline"
              onClick={() => {
                if (lastDraft.current) persistLocal(lastDraft.current);
              }}
            >
              Reintentar guardado local
            </Button>
          </div>
        ) : storageStatus === "saved" ? (
          <p role="status" className="text-xs text-muted-foreground">
            Guardado en este dispositivo
          </p>
        ) : null}
        {restored ? (
          <p className="text-xs text-muted-foreground">Borrador recuperado de este dispositivo.</p>
        ) : null}
        {recovered.filter((d) => d.id !== restored?.id).length ? (
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-sm">
              Otros borradores de esta sesión
            </summary>
            {recovered
              .filter((d) => d.id !== restored?.id)
              .map((d) => (
                <Button
                  key={d.id}
                  className="m-1"
                  variant="outline"
                  disabled={pending || storageStatus === "error"}
                  onClick={() => onRestore(d.id)}
                >
                  Recuperar{" "}
                  {new Date(d.updatedAt).toLocaleString("es-CL", { timeZone: "America/Santiago" })}
                </Button>
              ))}
          </details>
        ) : null}
        {conflict ? (
          <div className="rounded-md border border-primary/40 p-3 text-sm">
            <p>La sesión cambió. Revisa los valores antes de aplicar tu borrador.</p>
            <Button
              variant="outline"
              className="mt-2"
              disabled={pending || !!saveRequest || !!orderRequest}
              onClick={reviewCurrent}
            >
              Revisar versión actual
            </Button>
            {review ? (
              <div className="mt-3 space-y-3">
                {additionRequest || additionSelection.length ? (
                  <div className="rounded border p-2">
                    <p className="font-medium">Agregado pendiente</p>
                    <p>
                      Tu selección:{" "}
                      {additionSelection
                        .map((id) => exercises.find((e) => e.id === id)?.name ?? id)
                        .join(" · ")}
                    </p>
                    <p>Versión actual: {review.exercises.length} ejercicios</p>
                    {review.exercises.map((e) => (
                      <p key={e.id}>
                        {e.name} · {e.sets} × {e.repsMin}–{e.repsMax} · {e.note ?? ""}
                      </p>
                    ))}
                  </div>
                ) : null}
                {bulk ? (
                  <div className="rounded border p-2">
                    <p className="font-medium">Lote pendiente</p>
                    <p>
                      {bulk.ids.length} ejercicios ·{" "}
                      {bulk.setsEnabled ? `Series: ${bulk.sets}. ` : ""}
                      {bulk.repsEnabled ? `Repeticiones: ${bulk.repsMin}–${bulk.repsMax}. ` : ""}
                      {bulk.restEnabled ? `Descanso: ${bulk.restSeconds || "Libre"} s.` : ""}
                    </p>
                    {bulk.ids.map((id) => {
                      const row = review.exercises.find((e) => e.id === id);
                      return (
                        <p key={id}>
                          Actual:{" "}
                          {row
                            ? `${row.name} · ${row.sets} × ${row.repsMin}–${row.repsMax} · Descanso ${row.supersetId ? (row.supersetRestSeconds ?? "Libre") : (row.restSeconds ?? "Libre")} s`
                            : "Ejercicio eliminado"}
                        </p>
                      );
                    })}
                    {bulk.ids.some((id) => !review.exercises.some((e) => e.id === id)) ? (
                      <Button variant="outline" onClick={cancelSelection}>
                        Descartar lote de ejercicios eliminados
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {weekday !== undefined ? (
                  <div className="rounded border p-2">
                    <p className="font-medium">Día orientativo</p>
                    <p>Tu borrador: {WEEKDAYS[weekday] ?? "Sin día sugerido"}</p>
                    <p>Actual: {WEEKDAYS[review.weekday ?? -1] ?? "Sin día sugerido"}</p>
                  </div>
                ) : null}
                {title !== undefined ? (
                  <div className="rounded border p-2">
                    <p className="font-medium">Título de sesión</p>
                    <p>Tu borrador: {title || "Sin título"}</p>
                    <p>Actual: {review.title || "Sin título"}</p>
                  </div>
                ) : null}
                {Object.values(edits).map((row) => {
                  const remote = review.exercises.find((e) => e.id === row.id);
                  const local = remote ? effectivePrescription(remote, row) : row;
                  return (
                    <div key={row.id} className="rounded border p-2">
                      <p className="font-medium">{remote?.name ?? "Ejercicio eliminado"}</p>
                      <p>
                        Tu borrador: {local.sets} × {local.repsMin}–{local.repsMax} ·{" "}
                        {local.targetWeightKg || "Libre"} kg · {local.note}
                      </p>
                      <p>
                        Actual:{" "}
                        {remote
                          ? `${remote.sets} × ${remote.repsMin}–${remote.repsMax} · ${remote.targetWeightKg ?? "Libre"} kg · ${remote.note ?? ""}`
                          : "Ya no está en la rutina"}
                      </p>
                      {row.fields?.includes("restSeconds") ||
                      row.fields?.includes("supersetRestSeconds") ? (
                        <p>
                          Descanso{row.fields.includes("supersetRestSeconds") ? " de ronda" : ""}:
                          tu borrador {(local.supersetRestSeconds ?? local.restSeconds) || "Libre"}{" "}
                          s · actual{" "}
                          {remote
                            ? ((row.fields.includes("supersetRestSeconds")
                                ? remote.supersetRestSeconds
                                : remote.restSeconds) ?? "Libre")
                            : "Eliminado"}{" "}
                          s
                        </p>
                      ) : null}
                    </div>
                  );
                })}
                {Object.entries(alternativeEdits).map(([id, rows]) => {
                  const remote = review.exercises.find((e) => e.id === id);
                  const describe = (values: AlternativeDraft[]) =>
                    values.length
                      ? values
                          .map(
                            (r) =>
                              `${exercises.find((e) => e.id === r.exerciseId)?.name ?? r.exerciseId}: ${r.sets} × ${r.repsMin}–${r.repsMax} · ${r.targetWeightKg || "Libre"} kg`,
                          )
                          .join("; ")
                      : "Sin alternativas";
                  return (
                    <div key={`alternatives-${id}`} className="rounded border p-2">
                      <p className="font-medium">
                        Alternativas de {remote?.name ?? "ejercicio eliminado"}
                      </p>
                      <p>Tu borrador: {describe(rows)}</p>
                      <p>
                        Actual:{" "}
                        {remote
                          ? describe((remote.alternatives ?? []).map(alternativeDraft))
                          : "Ya no está en la rutina"}
                      </p>
                      {!remote ? (
                        <Button variant="outline" onClick={discardAlternatives}>
                          Descartar alternativas del ejercicio eliminado
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
                {orphanEdits.length ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const next = Object.fromEntries(
                        Object.entries(edits).filter(([id]) =>
                          review.exercises.some((e) => e.id === id),
                        ),
                      );
                      setEdits(next);
                      persistLocal({ edits: next });
                    }}
                  >
                    Descartar cambios de ejercicios eliminados
                  </Button>
                ) : null}
                <Button
                  disabled={
                    pending ||
                    !!orphanEdits.length ||
                    !!bulk?.ids.some((id) => !review.exercises.some((e) => e.id === id)) ||
                    orderPending ||
                    Object.keys(alternativeEdits).some(
                      (id) => !review.exercises.some((e) => e.id === id),
                    )
                  }
                  onClick={() => {
                    baseRevision.current = review.revision;
                    setConflict(false);
                    setError(null);
                    setSaveRequest(null);
                    setAlternativeError(null);
                    setAdditionRequest(null);
                    persistLocal({
                      revision: review.revision,
                      saveRequest: null,
                      additionRequest: null,
                    });
                  }}
                >
                  Aplicar mis cambios a esta versión
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {alternativeError ? (
          <p role="alert" className="text-sm text-destructive">
            {alternativeError}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
      <ExercisePicker
        visible={guard.activeWeek === undefined || guard.activeWeek === session.weekNumber}
        programId={programId}
        sessionId={session.id}
        getRevision={() => baseRevision.current ?? session.revision}
        request={additionRequest}
        selected={additionSelection}
        conflict={conflict}
        onChange={(selection, request) => {
          setAdditionSelection(selection);
          setAdditionRequest(request);
          guard.setDirty(`${session.id}-picker`, selection.length > 0 || !!request);
          return persistLocal({ additionSelection: selection, additionRequest: request });
        }}
        onResult={(result) => {
          if (result.conflict) setConflict(true);
          if (!result.error) {
            baseRevision.current = null;
            setReview(null);
            router.refresh();
          }
        }}
        exercises={exercises}
        count={session.exercises.length}
        disabled={
          dirty ||
          pending ||
          orderPending ||
          dragging ||
          !!copyRequest ||
          !!saveRequest ||
          conflict ||
          !!layoutRequest ||
          alternativesDirty ||
          selected.length > 0
        }
      />
    </Card>
  );
}
