"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
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
import type { SessionRow } from "@/lib/data/programs";
import { removeExerciseAction, removeSessionAction } from "../actions";
import { ActionForm } from "../action-form";
import {
  reviewSessionAction,
  duplicateRoutineAction,
  reorderExercisesAction,
  savePrescriptionsAction,
} from "../editor-actions";
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
  const [review, setReview] = useState<SessionRow | null>(null);
  const session = review ?? serverSession;
  const router = useRouter();
  const baseRevision = useRef<number | null>(restored?.revision ?? null);
  const [saveRequest, setSaveRequest] = useState<{
    id: string;
    revision: number;
    rows: PrescriptionDraft[];
  } | null>(restored?.saveRequest ?? null);
  const [orderRequest, setOrderRequest] = useState<{ id: string; revision: number } | null>(
    restored?.orderRequest ?? null,
  );
  const [conflict, setConflict] = useState(
    !!restored &&
      restored.revision !== session.revision &&
      !restored.saveRequest &&
      !restored.orderRequest,
  );
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
  const dragDisabled =
    pending ||
    orderPending ||
    conflict ||
    !!saveRequest ||
    guard.dirtyIds.some((id) => id !== orderKey && id !== dragKey);
  const drafts = orderedExercises.map((row) => edits[row.id] ?? prescriptionDraft(row));
  const changed = drafts.filter(
    (draft, index) =>
      JSON.stringify(draft) !== JSON.stringify(prescriptionDraft(orderedExercises[index])),
  );
  const orphanEdits = Object.values(edits).filter(
    (row) => !session.exercises.some((e) => e.id === row.id),
  );
  const dirty = changed.length > 0 || orphanEdits.length > 0 || !!saveRequest;
  const totalSets = drafts.reduce(
    (sum, row) => sum + (/^\d+$/.test(row.sets) ? Number(row.sets) : 0),
    0,
  );
  const structuralDisabled = pending || guard.dirty || dragging || conflict || !!saveRequest;
  const lastDraft = useRef<EditorDraft | null>(restored ? { ...restored, id: localId } : null);
  function persistLocal(overrides: Partial<EditorDraft> = {}) {
    const next: EditorDraft = {
      version: 1,
      id: localId,
      userId,
      programId,
      sessionId: session.id,
      revision: baseRevision.current ?? session.revision,
      updatedAt: new Date().toISOString(),
      edits,
      order,
      orderRequest,
      saveRequest,
      copyRequest,
      ...overrides,
    };
    lastDraft.current = next;
    if (Object.keys(next.edits).length || next.order || next.saveRequest || next.copyRequest) {
      if (persistence.persist(next)) {
        remember(localId);
        if (sourceDraft.current && ownsSource) {
          persistence.remove(sourceDraft.current, true, true);
          sourceDraft.current = null;
        }
      }
    } else {
      persistence.remove(next);
      remember("cleared");
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
      Object.keys(restored.edits).length > 0 || !!restored.saveRequest,
    );
    setGuardDirty(`${serverSession.id}-order`, !!restored.order);
    setGuardDirty(`${serverSession.id}-copy`, !!restored.copyRequest);
  }, [restored, persistence, serverSession.id, setGuardDirty]);
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
  function change(draft: PrescriptionDraft, field: keyof PrescriptionDraft, value: string) {
    baseRevision.current ??= session.revision;
    const next = { ...edits, [draft.id]: { ...draft, [field]: value } };
    const original = session.exercises.find((e) => e.id === draft.id);
    if (original && JSON.stringify(next[draft.id]) === JSON.stringify(prescriptionDraft(original)))
      delete next[draft.id];
    if (!Object.keys(next).length) baseRevision.current = null;
    persistLocal({ edits: next });
    setEdits(next);
    setErrors((old) => ({ ...old, [draft.id]: "" }));
    setError(null);
    setStatus(null);
    guard.setDirty(
      session.id,
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
    };
    const validation = validatePrescriptions(request.rows);
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
          saveRequest: result.uncertain ? request : null,
          revision: result.error ? request.revision : (result.revision ?? session.revision),
        });
        if (!result.error) removeRecovered();
        if (!result.error) setReview(null);
        setEdits(nextEdits);
        const remaining = changed.filter((row) => !result.savedIds.includes(row.id));
        guard.setDirty(session.id, remaining.length > 0 || !!result.uncertain);
        setError(result.error);
        setStatus(
          result.savedIds.length
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
  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base" role="heading" aria-level={3}>
              Sesión {session.label}
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
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
        <SortableExerciseList
          items={orderedExercises}
          disabled={dragDisabled}
          onReorder={reorder}
          onBusyChange={(value) => {
            setDragging(value);
            guard.setDirty(dragKey, value);
          }}
        >
          {(exercise, index, handle) => {
            const draft = drafts[index];
            const modified = changed.some((row) => row.id === draft.id);
            const errorId = `error-${exercise.id}`;
            return (
              <div
                key={exercise.id}
                className={`rounded-md border p-3 ${modified ? "border-primary/40 bg-primary/5" : "bg-background"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-start gap-1">
                    {handle}
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
                  <div className="flex w-full shrink-0 justify-end gap-0.5 sm:w-auto">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Duplicar ${exercise.name}`}
                      disabled={
                        structuralDisabled || session.exercises.length >= 15 || exercise.archived
                      }
                      onClick={() =>
                        duplicate({ id: crypto.randomUUID(), exerciseId: exercise.id })
                      }
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
                            index + delta >= orderedExercises.length
                          }
                          onClick={() => {
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
                <fieldset
                  disabled={pending || orderPending || dragging || !!copyRequest || !!saveRequest}
                  className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4"
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
                <details className="mt-2" open={draft.note ? true : undefined}>
                  <summary className="min-h-11 cursor-pointer py-3 text-xs text-muted-foreground">
                    Nota del ejercicio{draft.note ? "" : " (opcional)"}
                  </summary>
                  <Input
                    aria-label={`Nota de ${exercise.name}`}
                    value={draft.note}
                    maxLength={500}
                    disabled={pending || orderPending || dragging || !!copyRequest || !!saveRequest}
                    onChange={(e) => change(draft, "note", e.target.value)}
                    placeholder="Técnica, tempo o indicaciones"
                    className="h-11 bg-background"
                  />
                </details>
                {errors[exercise.id] ? (
                  <p id={errorId} role="alert" className="mt-2 text-sm text-destructive">
                    {errors[exercise.id]}
                  </p>
                ) : null}
              </div>
            );
          }}
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 p-3">
            <div className="text-xs">
              <p className="font-medium">
                {dirty ? `${changed.length} ejercicios con cambios` : "Prescripción al día"}
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
                  disabled={pending || orderPending || dragging || !!saveRequest}
                  onClick={() => {
                    if (
                      window.confirm("¿Descartar las prescripciones sin guardar de esta sesión?")
                    ) {
                      persistLocal({ edits: {}, saveRequest: null });
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
                  !dirty || pending || orderPending || dragging || !!copyRequest || conflict
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
                {Object.values(edits).map((row) => {
                  const remote = review.exercises.find((e) => e.id === row.id);
                  return (
                    <div key={row.id} className="rounded border p-2">
                      <p className="font-medium">{remote?.name ?? "Ejercicio eliminado"}</p>
                      <p>
                        Tu borrador: {row.sets} × {row.repsMin}–{row.repsMax} ·{" "}
                        {row.targetWeightKg || "Libre"} kg · {row.note}
                      </p>
                      <p>
                        Actual:{" "}
                        {remote
                          ? `${remote.sets} × ${remote.repsMin}–${remote.repsMax} · ${remote.targetWeightKg ?? "Libre"} kg · ${remote.note ?? ""}`
                          : "Ya no está en la rutina"}
                      </p>
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
                  disabled={pending || !!orphanEdits.length || orderPending}
                  onClick={() => {
                    baseRevision.current = review.revision;
                    setConflict(false);
                    setError(null);
                    setSaveRequest(null);
                    persistLocal({ revision: review.revision, saveRequest: null });
                  }}
                >
                  Aplicar mis cambios a esta versión
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <ExercisePicker
          programId={programId}
          sessionId={session.id}
          exercises={exercises}
          count={session.exercises.length}
          disabled={
            dirty ||
            pending ||
            orderPending ||
            dragging ||
            !!copyRequest ||
            !!saveRequest ||
            conflict
          }
        />
      </CardContent>
    </Card>
  );
}
