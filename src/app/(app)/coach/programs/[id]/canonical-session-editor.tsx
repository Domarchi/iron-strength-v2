"use client";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { ArrowUp, ArrowDown, Copy, Save, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ExerciseThumbnail } from "@/components/workout/exercise-thumbnail";
import { TypedPrescriptionEditor } from "@/components/coach/typed-prescription-editor";
import { PrescriptionEditor } from "@/components/coach/prescription-editor";
import {
  RawGoalSummary,
  TrainingPrescriptionSummary,
  CoachChangesSummary,
} from "@/components/coach/training-prescription-summary";
import { WEEKDAYS } from "@/domain/session-schedule";
import { exerciseBlocks } from "@/domain/supersets";
import { prescriptionToInput } from "@/domain/prescription-input";
import type {
  CoachCatalogExercise,
  CoachSessionRow,
  CoachExerciseRow,
} from "@/lib/data/coach-programs";
import {
  createCoachEditorBrowserStorage,
  listCoachEditorEntries,
} from "@/lib/coach/editor-browser";
import {
  CoachSessionEditorController,
  legacyEditorOperations,
} from "@/lib/coach/session-editor-controller";
import {
  effectiveCoachGoals,
  type CoachRowEdit,
  type CoachBulkRow,
} from "@/lib/coach/typed-prescription";
import { mergeCoachRowEdit } from "@/lib/coach/editor-rebase";
import {
  sessionLayout,
  groupSelected,
  separateGroup,
  separateMember,
  type LayoutRow,
} from "@/lib/coach/routine-layout";
import {
  mutateCanonicalSessionAction,
  reviewCanonicalSessionAction,
  reconcileLegacySessionAction,
} from "../canonical-editor-actions";
import { removeSessionAction } from "../actions";
import { ActionForm } from "../action-form";
import { useRoutineGuard } from "./week-workspace";
import { useSessionWorkspace } from "./session-workspace";
import { SortableExerciseList } from "./sortable-exercise-list";
import { RoutineRestSelect } from "./routine-rest-select";
import {
  CanonicalAlternatives,
  CanonicalBulkEditor,
  CanonicalExercisePicker,
} from "./canonical-editor-tools";

type Props = {
  userId: string;
  programId: string;
  session: CoachSessionRow;
  exercises: CoachCatalogExercise[];
  canDuplicateSession?: boolean;
};
export function CanonicalSessionEditor(props: Props) {
  return <Editor key={`${props.userId}:${props.programId}:${props.session.id}`} {...props} />;
}
function Editor({ userId, programId, session, exercises, canDuplicateSession = true }: Props) {
  const guard = useRoutineGuard(),
    workspace = useSessionWorkspace();
  const [controller] = useState(() => {
    const scope = { userId, programId, sessionId: session.id };
    return new CoachSessionEditorController(scope, session, exercises, {
      storage: createCoachEditorBrowserStorage(scope),
      discover: () => listCoachEditorEntries(scope),
      mutate: mutateCanonicalSessionAction,
      review: reviewCanonicalSessionAction,
      legacy: reconcileLegacySessionAction,
      createId: () => crypto.randomUUID(),
      now: () => new Date().toISOString(),
      remember: (id) => {
        try {
          sessionStorage.setItem(`is:coach-editor-tab:${userId}:${programId}:${session.id}`, id);
        } catch {
          /* Discovery still retains every scoped draft. */
        }
      },
    });
  });
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const run = (operation: () => Promise<unknown>) =>
    startTransition(async () => {
      await operation();
    });
  useEffect(() => {
    let preferred: string | undefined;
    try {
      preferred =
        sessionStorage.getItem(`is:coach-editor-tab:${userId}:${programId}:${session.id}`) ??
        undefined;
    } catch {
      /* Scoped recovery list remains available. */
    }
    void controller.init(preferred);
  }, [controller, userId, programId, session.id]);
  useEffect(() => controller.receiveSource(session), [controller, session]);
  const dirty = controller.dirty,
    setDirty = guard.setDirty;
  useEffect(() => {
    setDirty(session.id, dirty);
    return () => setDirty(session.id, false);
  }, [dirty, setDirty, session.id]);
  const lastCopy = state.copiedSessionId;
  const activatedCopy = useRef<string | null>(null);
  useEffect(() => {
    if (lastCopy && activatedCopy.current !== lastCopy) {
      activatedCopy.current = lastCopy;
      workspace?.activate(lastCopy);
    }
  }, [lastCopy, workspace]);
  const source = state.source,
    draft = state.draft;
  const planningDirty = guard.dirtyIds.some((id) => id.startsWith("planning-"));
  const otherDirty = guard.dirtyIds.some(
    (id) => id !== session.id && !id.startsWith(session.id + "-") && !id.endsWith("-drag"),
  );
  const unavailable =
    !state.ready ||
    !state.discovered ||
    state.busy ||
    !!state.blocked ||
    !!draft.pending ||
    !!state.confirmation ||
    state.removed ||
    state.needsRefresh;
  const targetDirty =
    Object.keys(draft.edits).length > 0 || draft.title !== undefined || draft.weekday !== undefined;
  const alternativesDirty = Object.keys(draft.alternatives).length > 0;
  const fieldsDisabled =
    unavailable ||
    planningDirty ||
    dragging ||
    draft.selection.length > 0 ||
    alternativesDirty ||
    draft.additionSelection.length > 0;
  const dragDisabled =
    unavailable ||
    planningDirty ||
    otherDirty ||
    targetDirty ||
    alternativesDirty ||
    draft.additionSelection.length > 0 ||
    !!draft.bulk ||
    draft.selection.length > 0 ||
    controller.conflict;
  const structureDisabled = dragDisabled || dragging;
  const selectionDisabled =
    unavailable ||
    planningDirty ||
    otherDirty ||
    dragging ||
    targetDirty ||
    alternativesDirty ||
    draft.additionSelection.length > 0 ||
    controller.conflict;
  const layoutPreview = draft.pending?.operation === "layout" ? draft.pending.data.items : null;
  const order = layoutPreview?.map((row) => row.id) ?? draft.order;
  const ordered = order
    ? order.flatMap((id) => {
        const row = source.exercises.find((row) => row.id === id);
        if (!row) return [];
        const layout = layoutPreview?.find((item) => item.id === id);
        return [{ ...row, ...layout }];
      })
    : source.exercises;
  const blocks = exerciseBlocks(ordered),
    layout = sessionLayout(ordered);
  const edited = (row: CoachExerciseRow) => controller.goals(row);
  const totalSets = ordered.reduce((total, row) => {
    const value = edited(row);
    return (
      total +
      (value.mode === "series"
        ? value.series.length
        : /^\d+$/.test(value.sets)
          ? Number(value.sets)
          : 0)
    );
  }, 0);
  const rejected =
    state.issue !== null && state.issue !== "uncertain" && state.issue !== "unauthenticated";
  const retrySave =
    draft.pending?.operation === "prescribe" && !state.busy && !state.confirmation && !rejected;
  const saveDisabled = retrySave ? false : fieldsDisabled || !targetDirty || controller.conflict;
  function editRow(row: CoachExerciseRow, patch: Partial<CoachRowEdit>) {
    controller.change((current) => ({
      ...current,
      edits: {
        ...current.edits,
        [row.id]: { ...current.edits[row.id], ...patch, id: row.id, exerciseId: row.exerciseId },
      },
    }));
  }
  function select(id: string) {
    controller.change((current) => {
      const selection = current.selection.includes(id)
        ? current.selection.filter((value) => value !== id)
        : [...current.selection, id];
      return {
        ...current,
        selection,
        bulk: current.bulk && selection.length ? { ...current.bulk, ids: selection } : null,
      };
    });
  }
  function cancelSelection() {
    controller.change((current) => ({ ...current, selection: [], bulk: null }));
  }
  function configure(items: LayoutRow[]) {
    run(() => controller.command("layout", { items }));
  }
  function reorder(ids: string[]) {
    run(() => controller.command("order", { ids }));
  }
  function moveBlock(id: string, delta: number) {
    const keys = blocks.map((block) => block.id),
      index = keys.indexOf(id);
    if (index < 0 || index + delta < 0 || index + delta >= keys.length) return;
    [keys[index], keys[index + delta]] = [keys[index + delta], keys[index]];
    reorder(
      keys.flatMap((key) =>
        blocks.find((block) => block.id === key)!.exercises.map((row) => row.id),
      ),
    );
  }
  function applyBulk(rows: CoachBulkRow[]) {
    controller.change((current) => {
      const edits = { ...current.edits };
      for (const row of rows) {
        const { restSeconds, supersetRestSeconds, ...targets } = row.changes;
        const next: CoachRowEdit = { id: row.id, exerciseId: row.exerciseId };
        if (Object.keys(targets).length) next.targets = { kind: "patch", changes: targets };
        if (restSeconds !== undefined)
          next.restSeconds = restSeconds === null ? "" : String(restSeconds);
        if (supersetRestSeconds !== undefined)
          next.supersetRestSeconds =
            supersetRestSeconds === null ? "" : String(supersetRestSeconds);
        edits[row.id] = next;
      }
      return { ...current, edits, selection: [], bulk: null };
    });
  }
  function rowCard(row: CoachExerciseRow, index: number, handle: ReactNode) {
    const goals = edited(row),
      edit = draft.edits[row.id],
      selected = draft.selection.includes(row.id);
    const rowDisabled = fieldsDisabled || !!(edit && edit.exerciseId !== row.exerciseId);
    const alternatives =
      draft.alternatives[row.id] ??
      row.alternatives.map((item) => ({
        exerciseId: item.exerciseId,
        input: prescriptionToInput(item.prescribed),
      }));
    return (
      <div
        key={row.id}
        data-detailed={goals.mode === "series"}
        className={`coach-exercise-row min-w-0 rounded-md border p-3 ${edit ? "border-primary/40 bg-primary/5" : "bg-background"}`}
      >
        <div className="coach-row-identity flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {handle}
            <ExerciseThumbnail name={row.name} />
            <div className="min-w-0">
              <h4 className="text-sm font-semibold">
                <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                {row.name}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.muscleGroup}
                {row.equipment ? ` · ${row.equipment}` : ""}
                {row.archived ? " · Archivado" : ""}
              </p>
            </div>
          </div>
          <div className="coach-row-actions flex w-full shrink-0 justify-end gap-0.5 sm:w-auto">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Duplicar ${row.name}`}
              disabled={structureDisabled || source.exercises.length >= 15 || row.archived}
              onClick={() =>
                run(() =>
                  controller.command("duplicate", { copyId: crypto.randomUUID(), rowId: row.id }),
                )
              }
            >
              <Copy aria-hidden />
            </Button>
            {([-1, 1] as const).map((delta) => (
              <Button
                type="button"
                key={delta}
                size="icon"
                variant="ghost"
                aria-label={`${delta < 0 ? "Subir" : "Bajar"} ${row.name}`}
                disabled={
                  structureDisabled ||
                  index + delta < 0 ||
                  index + delta >= ordered.length ||
                  (!!row.supersetId && ordered[index + delta]?.supersetId !== row.supersetId)
                }
                onClick={() => {
                  if (!row.supersetId) {
                    moveBlock(row.id, delta);
                    return;
                  }
                  const ids = ordered.map((row) => row.id);
                  [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
                  reorder(ids);
                }}
              >
                {delta < 0 ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />}
              </Button>
            ))}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Quitar ${row.name}`}
              disabled={structureDisabled}
              onClick={() => {
                if (window.confirm(`¿Quitar ${row.name} de esta sesión?`))
                  run(() => controller.command("remove", { rowId: row.id }));
              }}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        </div>
        <div className="coach-row-selection mt-2 flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-primary"
              aria-label={`Seleccionar ${row.name}`}
              checked={selected}
              disabled={selectionDisabled}
              onChange={() => select(row.id)}
            />
            Seleccionar
          </label>
          {row.supersetId ? (
            <Button
              type="button"
              variant="ghost"
              disabled={structureDisabled}
              aria-label={`Sacar ${row.name} de superserie`}
              onClick={() => configure(separateMember(layout, row.id))}
            >
              Sacar de superserie
            </Button>
          ) : (
            <RoutineRestSelect
              label={`Descanso de ${row.name}`}
              value={row.restSeconds}
              disabled={structureDisabled}
              onChange={(restSeconds) =>
                configure(
                  layout.map((item) => (item.id === row.id ? { ...item, restSeconds } : item)),
                )
              }
            />
          )}
        </div>
        <fieldset disabled={rowDisabled} className="coach-prescription mt-3 min-w-0">
          <TypedPrescriptionEditor
            name={row.name}
            value={goals}
            invalid={!!state.errors[row.id]}
            errorId={`error-${row.id}`}
            onChange={(input) => editRow(row, { targets: { kind: "replace", input } })}
          />
        </fieldset>
        <details className="coach-row-note mt-2" open={edit?.note !== undefined ? true : undefined}>
          <summary className="min-h-11 cursor-pointer py-3 text-xs text-muted-foreground">
            Nota del ejercicio{(edit?.note ?? row.note) ? "" : " (opcional)"}
          </summary>
          <Input
            aria-label={`Nota de ${row.name}`}
            maxLength={1000}
            value={edit?.note ?? row.note ?? ""}
            disabled={rowDisabled}
            onChange={(event) => editRow(row, { note: event.target.value })}
            placeholder="Técnica, tempo o indicaciones"
            className="h-11 bg-background"
          />
        </details>
        {(["restSeconds", "supersetRestSeconds"] as const)
          .filter((field) => edit?.[field] !== undefined)
          .map((field) => (
            <label key={field} className="flex flex-col gap-1 text-xs">
              Descanso pendiente{field === "supersetRestSeconds" ? " de ronda" : ""}
              <Input
                type="text"
                inputMode="numeric"
                aria-label={`Descanso pendiente de ${row.name}`}
                disabled={rowDisabled}
                value={edit![field]}
                onChange={(event) => editRow(row, { [field]: event.target.value })}
              />
            </label>
          ))}
        {state.errors[row.id] ? (
          <p id={`error-${row.id}`} role="alert" className="text-sm text-destructive">
            {state.errors[row.id]}
          </p>
        ) : null}
        <CanonicalAlternatives
          row={row}
          value={alternatives}
          catalog={exercises}
          dirty={!!draft.alternatives[row.id]}
          disabled={
            unavailable ||
            planningDirty ||
            otherDirty ||
            targetDirty ||
            !!draft.selection.length ||
            !!draft.additionSelection.length ||
            (alternativesDirty && !draft.alternatives[row.id]) ||
            controller.conflict
          }
          onChange={(rows) =>
            controller.change((current) => ({
              ...current,
              alternatives: { ...current.alternatives, [row.id]: rows },
            }))
          }
          onSave={() => run(() => controller.saveAlternatives(row.id))}
          onDiscard={() =>
            controller.change((current) => {
              const alternatives = { ...current.alternatives };
              delete alternatives[row.id];
              return { ...current, alternatives };
            })
          }
        />
      </div>
    );
  }
  if (!state.ready)
    return (
      <Card className="coach-session">
        <CardHeader>
          <CardTitle>Sesión {source.label}</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="status">Recuperando borradores…</p>
        </CardContent>
      </Card>
    );
  if (state.blocked) return <LegacyRecovery controller={controller} run={run} />;
  return (
    <fieldset
      disabled={planningDirty && !draft.pending && !state.confirmation}
      className="min-w-0"
      aria-label={`Editor de sesión ${source.label}`}
    >
      <Card
        id={`session-${source.id}`}
        className="coach-session"
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            (event.ctrlKey || event.metaKey) &&
            !event.altKey &&
            !event.repeat &&
            !event.defaultPrevented &&
            !event.currentTarget.closest("[hidden],fieldset[disabled]") &&
            !saveDisabled
          ) {
            event.preventDefault();
            run(() =>
              draft.pending?.operation === "prescribe" ? controller.retry() : controller.save(),
            );
          }
        }}
      >
        <CardHeader className="border-b pb-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base" role="heading" aria-level={3}>
                Sesión {source.label}
                {source.title ? ` · ${source.title}` : ""}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {source.exercises.length} ejercicios · {totalSets} series
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              <Button
                type="button"
                variant="outline"
                disabled={structureDisabled || !canDuplicateSession}
                aria-label={`Duplicar sesión ${source.label}`}
                onClick={() =>
                  run(() =>
                    controller.command("duplicate", { copyId: crypto.randomUUID(), rowId: null }),
                  )
                }
              >
                <Copy aria-hidden />
                Duplicar sesión
              </Button>
              <ActionForm
                action={removeSessionAction}
                fields={{ sessionId: source.id, programId }}
                label={<Trash2 aria-hidden />}
                ariaLabel={`Quitar la sesión ${source.label} de la semana ${source.weekNumber}`}
                confirm={`¿Quitar la sesión ${source.label} y sus ejercicios?`}
                disabled={structureDisabled}
                size="icon"
                variant="ghost"
              />
            </div>
          </div>
          <div className="coach-session-metadata mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Nombre de sesión {source.label}
              <Input
                value={draft.title ?? source.title ?? ""}
                maxLength={80}
                disabled={fieldsDisabled || controller.conflict}
                placeholder="Por ejemplo, Tren superior"
                onChange={(event) =>
                  controller.change((current) => {
                    const next = { ...current };
                    if (event.target.value === (source.title ?? "")) delete next.title;
                    else next.title = event.target.value;
                    return next;
                  })
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Día orientativo de sesión {source.label}
              <NativeSelect
                aria-label={`Día orientativo de sesión ${source.label}`}
                value={draft.weekday ?? source.weekday ?? -1}
                disabled={fieldsDisabled || controller.conflict}
                onChange={(event) =>
                  controller.change((current) => {
                    const next = { ...current },
                      day = Number(event.target.value);
                    if (day === (source.weekday ?? -1)) delete next.weekday;
                    else next.weekday = day;
                    return next;
                  })
                }
              >
                <option value={-1}>Sin día sugerido</option>
                {WEEKDAYS.map((day, i) => (
                  <option key={day} value={i}>
                    {day}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
        </CardHeader>
        <CardContent className="coach-session-content flex min-w-0 flex-col gap-4">
          {state.removed ? (
            <p role="status">La operación quedó confirmada. Esta sesión ya no está disponible.</p>
          ) : null}
          {!source.exercises.length ? (
            <div className="rounded-md border border-dashed p-5 text-center">
              <p className="text-sm font-medium">Arma esta sesión</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Elige ejercicios y ajusta sus objetivos.
              </p>
            </div>
          ) : null}
          {draft.selection.length ? (
            <div className="flex flex-wrap gap-2 rounded-md border p-3">
              <Button
                type="button"
                disabled={
                  selectionDisabled ||
                  !!draft.bulk ||
                  !groupSelected(layout, draft.selection, "preview")
                }
                onClick={() => {
                  const items = groupSelected(layout, draft.selection, crypto.randomUUID());
                  if (items) configure(items);
                }}
              >
                Agrupar seleccionados ({draft.selection.length})
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={state.busy || !!draft.pending}
                onClick={cancelSelection}
              >
                Cancelar selección
              </Button>
            </div>
          ) : null}
          {draft.selection.length ? (
            <CanonicalBulkEditor
              rows={source.exercises}
              value={draft.bulk ?? { ids: draft.selection, fields: {} }}
              disabled={unavailable || controller.conflict}
              onChange={(bulk) => controller.change((current) => ({ ...current, bulk }))}
              onApply={applyBulk}
              onCancel={cancelSelection}
            />
          ) : null}
          <SortableExerciseList
            items={blocks}
            disabled={dragDisabled}
            onReorder={(ids) =>
              reorder(
                ids.flatMap((id) =>
                  blocks.find((block) => block.id === id)!.exercises.map((row) => row.id),
                ),
              )
            }
            onBusyChange={(value) => {
              setDragging(value);
              guard.setDirty(`${source.id}-drag`, value);
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
                      value={block.exercises[0].supersetRestSeconds}
                      disabled={structureDisabled}
                      onChange={(supersetRestSeconds) =>
                        configure(
                          layout.map((row) =>
                            row.supersetId === block.supersetId
                              ? { ...row, supersetRestSeconds }
                              : row,
                          ),
                        )
                      }
                    />
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Subir ${block.name}`}
                        disabled={structureDisabled || blockIndex === 0}
                        onClick={() => moveBlock(block.id, -1)}
                      >
                        <ArrowUp aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Bajar ${block.name}`}
                        disabled={structureDisabled || blockIndex === blocks.length - 1}
                        onClick={() => moveBlock(block.id, 1)}
                      >
                        <ArrowDown aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        aria-label={`Separar ${block.name}`}
                        disabled={structureDisabled}
                        onClick={() => configure(separateGroup(layout, block.supersetId!))}
                      >
                        Separar {block.name}
                      </Button>
                    </div>
                  </div>
                ) : null}
                {block.exercises.map((row) =>
                  rowCard(row, ordered.indexOf(row), block.supersetId ? null : handle),
                )}
              </div>
            )}
          </SortableExerciseList>
          {source.exercises.length || targetDirty ? (
            <div className="coach-save-bar flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 p-3">
              <div className="text-xs">
                <p className="font-medium">
                  {targetDirty
                    ? `${Object.keys(draft.edits).length} ejercicios con cambios`
                    : "Prescripción al día"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {targetDirty ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={state.busy || !!state.confirmation || (!!draft.pending && !rejected)}
                    onClick={() => {
                      if (window.confirm("¿Descartar los cambios sin guardar de esta sesión?"))
                        run(() => controller.discard(true));
                    }}
                  >
                    Descartar cambios
                  </Button>
                ) : null}
                <Button
                  type="button"
                  aria-keyshortcuts="Control+Enter Meta+Enter"
                  disabled={saveDisabled}
                  onClick={() =>
                    run(() =>
                      draft.pending?.operation === "prescribe"
                        ? controller.retry()
                        : controller.save(),
                    )
                  }
                >
                  <Save aria-hidden />
                  {state.busy ? "Guardando…" : "Guardar sesión"}
                </Button>
              </div>
            </div>
          ) : null}
          {draft.pending || state.confirmation ? (
            <section
              className="space-y-2 rounded-md border p-3"
              aria-label="Operación pendiente"
              role={state.error && !state.confirmation ? "alert" : undefined}
            >
              <p role="status" className="text-sm">
                {state.confirmation
                  ? "El servidor confirmó el cambio. Falta completar la recuperación local."
                  : (state.error ?? "Operación pendiente de confirmar.")}
              </p>
              <Button
                type="button"
                disabled={state.busy}
                onClick={() => run(() => controller.retry())}
              >
                {state.confirmation ? "Completar recuperación local" : "Reintentar operación"}
              </Button>
            </section>
          ) : state.error ? (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>{state.error}</p>
              {state.storage === "error" || state.needsRefresh ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => run(() => controller.retry())}
                >
                  Reintentar guardado local
                </Button>
              ) : null}
            </div>
          ) : null}
          {state.lastResult ? (
            <p role="status" className="flex items-center gap-2 text-sm text-success">
              <Check aria-hidden className="size-4" />
              {state.lastResult.copyKind === "exercise"
                ? "Ejercicio duplicado."
                : state.lastResult.copyKind === "session"
                  ? "Sesión duplicada."
                  : state.lastOperation === "order"
                    ? "Orden guardado."
                    : state.lastOperation === "layout"
                      ? "Configuración guardada."
                      : state.lastOperation === "alternatives"
                        ? "Alternativas guardadas."
                        : state.lastOperation === "add"
                          ? "Ejercicios agregados a la sesión."
                          : "Cambios guardados."}
            </p>
          ) : null}
          {state.storage === "saved" ? (
            <p role="status" className="text-xs text-muted-foreground">
              Guardado en este dispositivo
            </p>
          ) : null}
          {state.storageConflict ? (
            <Button
              type="button"
              variant="outline"
              disabled={state.busy}
              onClick={() => {
                if (
                  window.confirm(
                    "¿Conservar tu propuesta en otro borrador sin cambiar el de la otra ventana?",
                  )
                )
                  run(() => controller.fork());
              }}
            >
              Conservar mi propuesta en otro borrador
            </Button>
          ) : null}
          {controller.conflict || rejected || state.comparison ? (
            <ConflictReview controller={controller} run={run} catalog={exercises} />
          ) : null}
          {state.entries.filter((entry) => !entry.key.endsWith(":" + draft.id)).length ? (
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-sm">
                Otros borradores de esta sesión
              </summary>
              {state.entries
                .filter((entry) => !entry.key.endsWith(":" + draft.id))
                .map((entry) => (
                  <Button
                    type="button"
                    key={entry.key}
                    variant="outline"
                    className="m-1"
                    disabled={state.busy || !!draft.pending || !!state.confirmation}
                    onClick={() => {
                      if (
                        controller.dirty &&
                        !window.confirm(
                          "¿Descartar la propuesta de esta pestaña y recuperar el otro borrador?",
                        )
                      )
                        return;
                      run(() => controller.init(entry.key.split(":").at(-1), true));
                    }}
                  >
                    Recuperar{" "}
                    {entry.entry.kind === "unknown"
                      ? "formato no compatible"
                      : new Date(entry.entry.draft.updatedAt).toLocaleString("es-CL", {
                          timeZone: "America/Santiago",
                        })}
                  </Button>
                ))}
            </details>
          ) : null}
        </CardContent>
        <CanonicalExercisePicker
          key={`${source.id}:${source.exercises.length}`}
          sessionId={source.id}
          catalog={exercises}
          selection={draft.additionSelection}
          count={source.exercises.length}
          visible={
            (guard.activeWeek === undefined || guard.activeWeek === source.weekNumber) &&
            (!workspace || workspace.activeId === source.id)
          }
          disabled={
            unavailable ||
            planningDirty ||
            otherDirty ||
            dragging ||
            targetDirty ||
            alternativesDirty ||
            !!draft.selection.length ||
            !!draft.bulk ||
            controller.conflict
          }
          onChange={(additionSelection) =>
            controller.change((current) => ({ ...current, additionSelection }))
          }
          onAdd={() =>
            run(() =>
              controller.command("add", {
                items: draft.additionSelection.map((exerciseId) => ({
                  id: crypto.randomUUID(),
                  exerciseId,
                })),
              }),
            )
          }
        />
      </Card>
    </fieldset>
  );
}
function ConflictReview({
  controller,
  run,
  catalog,
}: {
  controller: CoachSessionEditorController;
  run: (operation: () => Promise<unknown>) => void;
  catalog: CoachCatalogExercise[];
}) {
  const state = useSyncExternalStore(
      controller.subscribe,
      controller.getSnapshot,
      controller.getSnapshot,
    ),
    draft = state.draft,
    current = state.comparison;
  const missing = current
    ? Object.values(draft.edits).some(
        (edit) =>
          !current.exercises.some(
            (row) => row.id === edit.id && row.exerciseId === edit.exerciseId,
          ),
      ) ||
      Object.keys(draft.alternatives).some((id) => !current.exercises.some((row) => row.id === id))
    : false;
  const structural = draft.pending?.operation === "order" || draft.pending?.operation === "layout";
  return (
    <section
      className="space-y-3 rounded-md border border-primary/40 p-3 text-sm"
      aria-label="Revisión de conflicto"
    >
      <p>La sesión cambió. Revisa los valores antes de aplicar tu borrador.</p>
      <Button
        type="button"
        variant="outline"
        disabled={
          state.busy ||
          !!(
            draft.pending &&
            (state.issue === null ||
              state.issue === "uncertain" ||
              state.issue === "unauthenticated")
          )
        }
        onClick={() => run(() => controller.review())}
      >
        Revisar versión actual
      </Button>
      {current ? (
        <div className="space-y-3">
          {draft.title !== undefined ? (
            <div>
              <p>Título de tu borrador: {draft.title || "Sin título"}</p>
              <p>Actual: {current.title || "Sin título"}</p>
            </div>
          ) : null}
          {draft.weekday !== undefined ? (
            <div>
              <p>Día de tu borrador: {WEEKDAYS[draft.weekday] ?? "Sin día sugerido"}</p>
              <p>Actual: {WEEKDAYS[current.weekday ?? -1] ?? "Sin día sugerido"}</p>
            </div>
          ) : null}
          {Object.values(draft.edits).map((edit) => {
            const row = current.exercises.find((row) => row.id === edit.id);
            let proposal = edit;
            try {
              if (row)
                proposal = mergeCoachRowEdit(
                  draft.base?.exercises.find((base) => base.id === edit.id) ?? null,
                  row,
                  edit,
                );
            } catch {
              /* Raw local values remain visible until corrected. */
            }
            return (
              <div key={edit.id} className="space-y-2 rounded border p-2">
                <p className="font-medium">{row?.name ?? "Ejercicio eliminado"}</p>
                <p>Tu borrador:</p>
                {row && row.exerciseId === edit.exerciseId ? (
                  <RawGoalSummary input={effectiveCoachGoals(row, proposal)} />
                ) : edit.targets?.kind === "replace" ? (
                  <RawGoalSummary input={edit.targets.input} />
                ) : edit.targets?.kind === "patch" ? (
                  <CoachChangesSummary changes={edit.targets.changes} />
                ) : null}
                {edit.note !== undefined ? <p>Nota: {edit.note || "Sin nota"}</p> : null}
                {edit.restSeconds !== undefined || edit.supersetRestSeconds !== undefined ? (
                  <p>
                    Descanso propuesto: {(edit.supersetRestSeconds ?? edit.restSeconds) || "Libre"}
                  </p>
                ) : null}
                <p>Actual:</p>
                {row ? (
                  <>
                    <TrainingPrescriptionSummary prescribed={row.prescribed} />
                    <p>{row.note ?? "Sin nota"}</p>
                    <p>
                      Descanso:{" "}
                      {(row.supersetId ? row.supersetRestSeconds : row.restSeconds) ?? "Libre"}
                    </p>
                  </>
                ) : (
                  <p>Ya no está en la rutina.</p>
                )}
              </div>
            );
          })}
          {Object.entries(draft.alternatives).map(([id, alternatives]) => (
            <div key={id} className="space-y-2 rounded border p-2">
              <p className="font-medium">
                Alternativas de{" "}
                {current.exercises.find((row) => row.id === id)?.name ?? "ejercicio retirado"}
              </p>
              <p>Tu borrador:</p>
              {alternatives.map((item) => (
                <div key={item.exerciseId}>
                  <p>
                    {catalog.find((exercise) => exercise.id === item.exerciseId)?.name ??
                      "Ejercicio no disponible"}
                  </p>
                  <RawGoalSummary input={item.input} />
                </div>
              ))}
              <p>
                {current.exercises.find((row) => row.id === id)?.alternatives.length === 0
                  ? "Actual: Sin alternativas"
                  : "Actual:"}
              </p>
              {current.exercises
                .find((row) => row.id === id)
                ?.alternatives.map((item) => (
                  <div key={item.id}>
                    <p>{item.name}</p>
                    <TrainingPrescriptionSummary prescribed={item.prescribed} />
                  </div>
                )) ?? "Ejercicio eliminado"}
            </div>
          ))}
          {draft.additionSelection.length ? (
            <div className="space-y-2 rounded border p-2">
              <p className="font-medium">Ejercicios que agregarás</p>
              <ul aria-label="Ejercicios que agregarás" className="space-y-1">
                {draft.additionSelection.map((id) => (
                  <li key={id}>
                    {catalog.find((exercise) => exercise.id === id)?.name ??
                      "Ejercicio no disponible"}
                  </li>
                ))}
              </ul>
              <p className="font-medium">Sesión actual · {current.exercises.length} ejercicios</p>
              <ol aria-label="Contenido actual de la sesión" className="space-y-2">
                {current.exercises.map((row, index) => (
                  <li key={row.id}>
                    <p>
                      {index + 1}. {row.name}
                    </p>
                    <TrainingPrescriptionSummary prescribed={row.prescribed} />
                    {row.note ? <p>{row.note}</p> : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {!draft.base &&
          Object.values(draft.edits).some((edit) => edit.targets?.kind === "replace") ? (
            <p>
              Este formato no conserva la base anterior: los objetivos completos del borrador
              reemplazarán los objetivos actuales tras tu confirmación.
            </p>
          ) : null}
          {structural ? (
            <>
              <StructureComparison
                label="Orden y grupos de tu borrador"
                rows={
                  draft.pending?.operation === "layout"
                    ? draft.pending.data.items
                    : draft.pending?.operation === "order"
                      ? draft.pending.data.ids.map((id) => {
                          const row = draft.base?.exercises.find((row) => row.id === id);
                          return {
                            id,
                            restSeconds: row?.restSeconds ?? null,
                            supersetId: row?.supersetId ?? null,
                            supersetRestSeconds: row?.supersetRestSeconds ?? null,
                          };
                        })
                      : []
                }
                names={[...state.source.exercises, ...current.exercises]}
              />
              <StructureComparison
                label="Orden y grupos actuales"
                rows={current.exercises}
                names={current.exercises}
              />
              <p>El orden o grupo rechazado se conserva hasta que lo descartes.</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (window.confirm("¿Descartar este orden o grupo y cargar la versión actual?"))
                    run(() => controller.approveReview(true, true));
                }}
              >
                Descartar orden y cargar versión actual
              </Button>
            </>
          ) : (
            <Button
              type="button"
              disabled={state.busy}
              onClick={() => {
                if (
                  missing &&
                  !window.confirm(
                    "¿Descartar solo los cambios de ejercicios eliminados y conservar los demás?",
                  )
                )
                  return;
                run(() => controller.approveReview(missing));
              }}
            >
              {missing
                ? "Descartar cambios de ejercicios eliminados y aplicar los demás"
                : "Aplicar mis cambios a esta versión"}
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}
function StructureComparison({
  label,
  rows,
  names,
}: {
  label: string;
  rows: LayoutRow[];
  names: { id: string; name: string }[];
}) {
  const groups = [...new Set(rows.map((row) => row.supersetId).filter((id) => id !== null))];
  return (
    <div className="rounded border p-2">
      <p className="font-medium">{label}</p>
      <ol aria-label={label} className="mt-2 space-y-1">
        {rows.map((row, index) => (
          <li key={row.id}>
            {index + 1}. {names.find((item) => item.id === row.id)?.name ?? "Ejercicio retirado"}
            {row.supersetId
              ? ` · Superserie ${groups.indexOf(row.supersetId) + 1}`
              : " · Individual"}
            {` · Descanso: ${(row.supersetId ? row.supersetRestSeconds : row.restSeconds) === null ? "sin prescripción" : `${row.supersetId ? row.supersetRestSeconds : row.restSeconds} s`}`}
          </li>
        ))}
      </ol>
    </div>
  );
}
function LegacyRecovery({
  controller,
  run,
}: {
  controller: CoachSessionEditorController;
  run: (operation: () => Promise<unknown>) => void;
}) {
  const state = useSyncExternalStore(
      controller.subscribe,
      controller.getSnapshot,
      controller.getSnapshot,
    ),
    selected = state.blocked;
  if (!selected) return null;
  if (selected.entry.kind === "unknown")
    return (
      <Card>
        <CardHeader>
          <CardTitle>Borrador en otro formato</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert" className="text-sm">
            Este borrador usa un formato no compatible o no pudo leerse. Conservamos sus datos sin
            sobrescribirlos.
          </p>
          <Button
            type="button"
            className="mt-3"
            onClick={() => run(() => controller.init(selected.key.split(":").at(-1), true))}
          >
            Reintentar lectura
          </Button>
        </CardContent>
      </Card>
    );
  if (selected.entry.kind !== "legacy") return null;
  const draft = selected.entry.draft,
    operations = legacyEditorOperations(draft),
    locked = operations.length > 0;
  const labels = {
    save: "guardado",
    order: "orden",
    copy: "copia",
    layout: "configuración",
    alternatives: "alternativas",
    add: "agregado",
  };
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Borrador de una versión anterior</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          {locked
            ? "Confirma los intentos pendientes antes de convertir este borrador."
            : "Completa los valores pendientes para recuperar este borrador en el editor actual."}
        </p>
        <fieldset disabled={locked || state.busy} className="min-w-0 space-y-3">
          {Object.values(draft.edits).map((edit) => (
            <div key={edit.id} className="min-w-0 space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">
                {state.source.exercises.find((row) => row.id === edit.id)?.name ??
                  "Ejercicio retirado"}
              </p>
              <PrescriptionEditor
                name={`borrador anterior ${edit.id}`}
                value={edit}
                onChange={(next, fields) =>
                  controller.legacyChange((current) => ({
                    ...current,
                    edits: {
                      ...current.edits,
                      [edit.id]: {
                        ...next,
                        ...(edit.fields
                          ? { fields: [...new Set([...edit.fields, ...fields])] }
                          : {}),
                      },
                    },
                  }))
                }
              />
              <Input
                aria-label={`Nota del borrador anterior ${edit.id}`}
                value={edit.note}
                onChange={(event) =>
                  controller.legacyChange((current) => ({
                    ...current,
                    edits: { ...current.edits, [edit.id]: { ...edit, note: event.target.value } },
                  }))
                }
              />
              {!state.source.exercises.some(
                (row) => row.id === edit.id && row.exerciseId === edit.exerciseId,
              ) ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (
                      !window.confirm(
                        "¿Retirar esta edición del borrador? Los demás cambios se conservan.",
                      )
                    )
                      return;
                    controller.legacyChange((current) => {
                      const edits = { ...current.edits };
                      delete edits[edit.id];
                      return { ...current, edits };
                    });
                  }}
                >
                  Retirar edición del ejercicio cambiado
                </Button>
              ) : null}
            </div>
          ))}
          {Object.entries(draft.alternativeEdits ?? {}).map(([rowId, rows]) => (
            <div key={rowId} className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Alternativas anteriores</p>
              {rows.map((alternative, index) => (
                <PrescriptionEditor
                  key={alternative.exerciseId}
                  name={`alternativa anterior ${index + 1}`}
                  value={alternative}
                  onChange={(next) =>
                    controller.legacyChange((current) => ({
                      ...current,
                      alternativeEdits: {
                        ...current.alternativeEdits,
                        [rowId]: rows.map((value, i) => (i === index ? next : value)),
                      },
                    }))
                  }
                />
              ))}
            </div>
          ))}
        </fieldset>
        {operations.map((operation) => (
          <Button
            key={operation}
            type="button"
            className="mr-2"
            disabled={state.busy}
            onClick={() => run(() => controller.reconcileLegacy(operation))}
          >
            Confirmar {labels[operation]} anterior
          </Button>
        ))}
        {!locked ? (
          <Button
            type="button"
            disabled={state.busy}
            onClick={() => run(() => controller.migrateLegacy())}
          >
            Recuperar en el editor actual
          </Button>
        ) : null}
        {locked &&
        state.issue &&
        state.issue !== "uncertain" &&
        state.issue !== "unauthenticated" ? (
          <Button
            type="button"
            variant="outline"
            disabled={state.busy}
            onClick={() => {
              if (
                window.confirm(
                  "El servidor rechazó ese intento. ¿Conservar los campos y retirar solo la petición rechazada para revisarlos de nuevo?",
                )
              )
                run(() => controller.resolveLegacyRejected());
            }}
          >
            Conservar campos y revisar de nuevo
          </Button>
        ) : null}
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        {state.storage === "error" ? (
          <Button type="button" variant="outline" onClick={() => run(() => controller.flush())}>
            Reintentar guardado local
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
