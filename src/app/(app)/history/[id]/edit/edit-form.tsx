"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkoutChanges } from "@/components/workout-changes/provider";
import type { WorkoutCorrectionSnapshot } from "@/lib/mobile/workout-correction-contracts";
import {
  correctionFormFromSnapshot,
  correctionFromForm,
  type WorkoutCorrectionForm,
} from "@/lib/workout/correction-form";
import { workoutCorrectionIssueMessage } from "@/lib/workout/correction-draft";
import { isWorkoutEditable } from "@/domain/edit-window";
type Row = WorkoutCorrectionForm["sets"][number];
const kind = {
  working: "Trabajo",
  warmup: "Calentamiento",
  failure: "Al fallo",
  drop: "Descendente",
} as const;
function values(row: Row) {
  return [
    row.weightKg !== "" ? `${row.weightKg} kg` : null,
    row.reps !== "" ? `${row.reps} reps` : null,
    row.durationSeconds !== "" ? `${row.durationSeconds} s` : null,
    row.distanceMeters !== "" ? `${row.distanceMeters} m` : null,
    row.setType ? kind[row.setType] : row.isWarmup ? "Calentamiento" : null,
    row.effort !== "" ? `Esfuerzo ${row.effort}` : null,
    row.removed ? "Retirada" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
function message(error: unknown) {
  return error instanceof z.ZodError
    ? "Revisa los límites de cada serie, esfuerzo de 1 a 10 y notas de hasta 500 caracteres. Conserva al menos una serie."
    : error instanceof Error
      ? error.message
      : "No pudimos completar la operación. Conservamos tu propuesta.";
}
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border p-3 text-sm wrap-anywhere">
      {children}
    </p>
  );
}
export function EditWorkoutForm({
  workoutId,
  initial,
  initialError,
}: {
  workoutId: string;
  initial: WorkoutCorrectionSnapshot | null;
  initialError: string | null;
}) {
  const {
    corrections: controller,
    correction: c,
    removal: r,
    readCorrection,
  } = useWorkoutChanges();
  const [error, setError] = useState<string | null>(null),
    [review, setReview] = useState(false),
    [discard, setDiscard] = useState(false),
    [reload, setReload] = useState(false),
    [finished, setFinished] = useState(false),
    [fetching, setFetching] = useState(false);
  const [confirmationAtEntry] = useState(c.confirmation),
    opening = useRef(false);
  const removalPending = r.pending?.request.workoutId === workoutId;
  useEffect(() => {
    if (
      !c.ready ||
      c.busy ||
      c.paused ||
      c.blocked ||
      c.dirty ||
      c.pending ||
      c.draft?.changed ||
      c.draft?.base.workout.id === workoutId ||
      !initial ||
      initial.workout.id !== workoutId ||
      !isWorkoutEditable(initial.workout.performedOn, initial.today) ||
      finished ||
      opening.current ||
      removalPending ||
      r.busy ||
      (c.confirmation && c.confirmation !== confirmationAtEntry)
    )
      return;
    opening.current = true;
    void controller
      .open(initial)
      .catch((e) => setError(message(e)))
      .finally(() => {
        opening.current = false;
      });
  }, [c, controller, initial, workoutId, finished, confirmationAtEntry, removalPending, r.busy]);
  const own = c.draft?.base.workout.id === workoutId ? c.draft : null,
    disabled = c.busy || c.paused || c.blocked || fetching || removalPending || r.busy,
    cause = workoutCorrectionIssueMessage(c.pending?.issue ?? null),
    done =
      c.confirmation &&
      c.confirmation !== confirmationAtEntry &&
      c.confirmation.workoutId === workoutId &&
      !c.draft &&
      !c.dirty;
  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    }
  }
  function change(form: WorkoutCorrectionForm) {
    if (disabled) return;
    setReview(false);
    setError(null);
    void controller.change(form).catch((e) => setError(message(e)));
  }
  const reread = reload ? (
    <>
      <Notice>
        Se reemplazará la propuesta en memoria por la guardada en este dispositivo. Se perderán los
        cambios que no se pudieron guardar.
      </Notice>
      <Button
        disabled={c.busy || c.paused || fetching}
        onClick={() => {
          void run(async () => {
            await controller.reloadLocal(true);
            setReload(false);
            setReview(false);
          });
        }}
      >
        Confirmar relectura local
      </Button>
      <Button
        variant="outline"
        disabled={c.busy || c.paused || fetching}
        onClick={() => setReload(false)}
      >
        Conservar propuesta en memoria
      </Button>
    </>
  ) : (
    <Button
      variant="outline"
      disabled={c.busy || c.paused || fetching}
      onClick={() => setReload(true)}
    >
      Releer corrección local
    </Button>
  );
  const back = (
    <Button variant="outline" render={<Link href="/history" />}>
      Volver sin descartar
    </Button>
  );
  if (done)
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Corrección confirmada</h2>
        <Button render={<Link href={`/history/${workoutId}`} />}>Ver resultado</Button>
        {back}
      </div>
    );
  if (finished)
    return (
      <div className="space-y-4">
        <p>Corrección descartada en este dispositivo</p>
        {back}
      </div>
    );
  if (!c.ready) return <p className="text-sm text-muted-foreground">Recuperando corrección…</p>;
  if (c.blocked)
    return (
      <div className="flex flex-col gap-3">
        <Notice>{c.error ?? "No pudimos recuperar la corrección local."}</Notice>
        {own ? (
          <div className="space-y-2">
            <h2 className="font-medium">Propuesta en memoria</h2>
            {own.form.sets.map((row, i) => (
              <p className="text-sm" key={row.id}>
                {own.base.workout.sets[i].exerciseName} · Serie {own.base.workout.sets[i].setNumber}
                : {values(row)}
              </p>
            ))}
          </div>
        ) : null}
        {reread}
        {back}
      </div>
    );
  if (!own)
    return (
      <div className="flex flex-col gap-3">
        {c.draft?.changed || c.pending ? (
          <>
            <Notice>Hay una corrección pendiente de otro entrenamiento.</Notice>
            <Button render={<Link href={`/history/${c.draft!.base.workout.id}/edit`} />}>
              Retomar corrección pendiente
            </Button>
          </>
        ) : (
          <Notice>
            {initialError ??
              (initial && !isWorkoutEditable(initial.workout.performedOn, initial.today)
                ? "Terminó el plazo de siete días para modificar este entrenamiento."
                : "No pudimos abrir este entrenamiento.")}
          </Notice>
        )}
        {error || c.error ? <Notice>{error ?? c.error}</Notice> : null}
        {c.dirty ? reread : null}
        {back}
      </div>
    );
  const w = own.base.workout,
    baseline = correctionFormFromSnapshot(own.base),
    comparisonBase = c.comparison ? correctionFormFromSnapshot(c.comparison.latest) : null,
    typed = w.structure?.version === 2,
    kept = own.form.sets.filter((s) => !s.removed).length;
  const setField = (row: Row, patch: Partial<Row>) =>
    change({
      ...own.form,
      sets: own.form.sets.map((s) => (s.id === row.id ? { ...s, ...patch } : s)),
    });
  function numeric(label: string, value: string, onChange: (v: string) => void, caption?: string) {
    return (
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        {caption ?? label}
        <Input
          aria-label={label}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={30}
          disabled={disabled || !!c.pending || review}
          className="min-h-11"
        />
      </label>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">
          {w.title ?? `Sesión ${w.sessionLabel ?? "registrada"}`}
        </h2>
        <p
          aria-label="Estado de corrección"
          aria-live="polite"
          className="text-sm text-muted-foreground"
        >
          {c.dirty
            ? "Cambios pendientes de guardar en este dispositivo"
            : c.pending
              ? "Pendiente de confirmar en el servidor"
              : own.changed
                ? "Guardado en este dispositivo"
                : "Sin cambios"}
        </p>
      </div>
      {removalPending ? (
        <Notice>
          Hay una eliminación pendiente de este entrenamiento. Resuélvela antes de corregirlo.
        </Notice>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {c.error && c.error !== error && c.error !== cause ? <Notice>{c.error}</Notice> : null}
      {cause ? <Notice>{cause}</Notice> : null}
      {c.dirty ? (
        <Button
          variant="outline"
          disabled={c.busy || c.paused || fetching}
          onClick={() => {
            void run(() => controller.retryStorage());
          }}
        >
          Guardar propuesta en este dispositivo
        </Button>
      ) : null}
      {c.comparison ? (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <h3 className="font-medium">Versión actual</h3>
          <p className="text-sm">
            Revisión {c.comparison.latest.workout.revision}. Se combinan tus campos modificados con
            los demás cambios actuales.
          </p>
          <p className="text-sm">Nota actual: {c.comparison.latest.workout.note ?? "Sin nota"}</p>
          <p className="text-sm">Nota propuesta: {c.comparison.form.note || "Sin nota"}</p>
          <p className="text-sm">
            Esfuerzo actual: {c.comparison.latest.workout.perceivedEffort ?? "Sin indicar"}
          </p>
          <p className="text-sm">
            Esfuerzo propuesto: {c.comparison.form.perceivedEffort || "Sin indicar"}
          </p>
          {c.comparison.form.exerciseNotes?.map((note, index) => {
            const current = comparisonBase!.exerciseNotes?.find(
              (row) => row.sessionExerciseId === note.sessionExerciseId,
            )?.note;
            if (current === note.note) return null;
            const name =
              c.comparison!.latest.workout.sets.find(
                (row) => row.sessionExerciseId === note.sessionExerciseId,
              )?.exerciseName ?? `Ejercicio ${index + 1}`;
            return (
              <div className="space-y-1 text-sm" key={note.sessionExerciseId}>
                <p className="font-medium">Nota · {name}</p>
                <p>Actual: {current || "Sin nota"}</p>
                <p>Propuesta: {note.note || "Sin nota"}</p>
              </div>
            );
          })}
          {c.comparison.latest.workout.sets.map((row, index) => {
            const current = comparisonBase!.sets[index],
              proposed = c.comparison!.form.sets[index];
            return (
              <div className="space-y-1 text-sm" key={row.id}>
                <p className="font-medium">
                  {row.exerciseName} · Serie {row.setNumber}
                </p>
                <p>Actual: {values(current)}</p>
                <p>Propuesta: {values(proposed)}</p>
              </div>
            );
          })}
          {c.comparison.unapplied.map((v) => (
            <p className="text-sm" key={v.id}>
              No se puede aplicar: {v.exerciseName} · Serie {v.setNumber}: {values(v.values)}
            </p>
          ))}
          <Button
            disabled={disabled || c.dirty}
            onClick={() => {
              void run(() => controller.acceptComparison());
            }}
          >
            Aceptar versión revisada
          </Button>
          {c.comparison.unapplied.length ? (
            <Button
              variant="outline"
              disabled={disabled || c.dirty}
              onClick={() => {
                void run(() => controller.acceptComparison(true));
              }}
            >
              Aceptar sin los cambios que ya no se pueden aplicar
            </Button>
          ) : null}
        </section>
      ) : null}
      {!review ? (
        <>
          <section className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2">
            {numeric("Esfuerzo del entrenamiento (1 a 10)", own.form.perceivedEffort, (v) =>
              change({ ...own.form, perceivedEffort: v }),
            )}
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              Nota del entrenamiento
              <Textarea
                aria-label="Nota del entrenamiento"
                value={own.form.note}
                disabled={disabled || !!c.pending}
                maxLength={4000}
                onChange={(e) => change({ ...own.form, note: e.target.value })}
              />
            </label>
          </section>
          {w.sets.map((original, i) => {
            const row = own.form.sets[i];
            return (
              <fieldset key={row.id} className="space-y-3 rounded-lg border bg-card p-4">
                <legend className="px-1 text-sm font-medium">
                  {original.exerciseName} · Serie {original.setNumber}
                </legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {original.metrics.weightKg !== null
                    ? numeric(
                        `Peso de la serie ${original.setNumber} de ${original.exerciseName} (kg)`,
                        row.weightKg,
                        (v) => setField(row, { weightKg: v }),
                        "Kg",
                      )
                    : null}
                  {original.metrics.reps !== null
                    ? numeric(
                        `Repeticiones de la serie ${original.setNumber} de ${original.exerciseName}`,
                        row.reps,
                        (v) => setField(row, { reps: v }),
                        "Reps",
                      )
                    : null}
                  {original.metrics.durationSeconds !== null
                    ? numeric(
                        `Segundos de la serie ${original.setNumber} de ${original.exerciseName}`,
                        row.durationSeconds,
                        (v) => setField(row, { durationSeconds: v }),
                        "Segundos",
                      )
                    : null}
                  {original.metrics.distanceMeters !== null
                    ? numeric(
                        `Metros de la serie ${original.setNumber} de ${original.exerciseName}`,
                        row.distanceMeters,
                        (v) => setField(row, { distanceMeters: v }),
                        "Metros",
                      )
                    : null}
                  {typed
                    ? numeric(
                        `Esfuerzo de la serie ${original.setNumber} de ${original.exerciseName}`,
                        row.effort,
                        (v) => setField(row, { effort: v }),
                        "Esfuerzo",
                      )
                    : null}
                </div>
                {typed ? (
                  <label className="flex flex-col gap-1 text-sm">
                    Tipo de serie
                    <select
                      aria-label={`Tipo de serie ${original.setNumber} de ${original.exerciseName}`}
                      className="min-h-11 rounded-md border bg-card px-3 text-base"
                      value={row.setType ?? "working"}
                      disabled={disabled || !!c.pending}
                      onChange={(e) => {
                        const value = e.target.value as NonNullable<Row["setType"]>;
                        setField(row, { setType: value, isWarmup: value === "warmup" });
                      }}
                    >
                      {Object.entries(kind).map(([key, label]) => (
                        <option value={key} key={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={row.isWarmup}
                      disabled={disabled || !!c.pending}
                      onChange={(e) => setField(row, { isWarmup: e.target.checked })}
                    />
                    Calentamiento de serie {original.setNumber} de {original.exerciseName}
                  </label>
                )}
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`Retirar serie ${original.setNumber} de ${original.exerciseName}`}
                    checked={row.removed}
                    disabled={disabled || !!c.pending || (!row.removed && kept <= 1)}
                    onChange={(e) => setField(row, { removed: e.target.checked })}
                  />
                  Quitar esta serie
                </label>
              </fieldset>
            );
          })}
          {own.form.exerciseNotes?.map((note, index) => (
            <label className="flex flex-col gap-1 text-sm" key={note.sessionExerciseId}>
              Nota del ejercicio
              <Textarea
                aria-label={`Nota del ejercicio ${w.sets.find((set) => set.sessionExerciseId === note.sessionExerciseId)?.exerciseName ?? index + 1}`}
                value={note.note}
                maxLength={4000}
                disabled={disabled || !!c.pending}
                onChange={(e) =>
                  change({
                    ...own.form,
                    exerciseNotes: own.form.exerciseNotes!.map((n) =>
                      n.sessionExerciseId === note.sessionExerciseId
                        ? { ...n, note: e.target.value }
                        : n,
                    ),
                  })
                }
              />
            </label>
          ))}
        </>
      ) : (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <h3 className="font-medium">Revisar corrección</h3>
          <p>
            {kept} series conservadas · {own.form.sets.length - kept} retiradas
          </p>
          {own.form.sets.map((row, i) =>
            JSON.stringify(row) !== JSON.stringify(baseline.sets[i]) ? (
              <div key={row.id} className="space-y-1 text-sm">
                <p className="font-medium">
                  {w.sets[i].exerciseName} · Serie {w.sets[i].setNumber}
                </p>
                <p>Antes: {values(baseline.sets[i])}</p>
                <p>Después: {values(row)}</p>
              </div>
            ) : null,
          )}
          <p className="text-sm">Nota: {own.form.note || "Sin nota"}</p>
          <p className="text-sm">Esfuerzo: {own.form.perceivedEffort || "Sin indicar"}</p>
          {own.form.exerciseNotes?.map((note, index) => {
            const before = baseline.exerciseNotes?.find(
              (row) => row.sessionExerciseId === note.sessionExerciseId,
            )?.note;
            if (before === note.note) return null;
            const name =
              w.sets.find((row) => row.sessionExerciseId === note.sessionExerciseId)
                ?.exerciseName ?? `Ejercicio ${index + 1}`;
            return (
              <div className="space-y-1 text-sm" key={note.sessionExerciseId}>
                <p className="font-medium">Nota · {name}</p>
                <p className="text-muted-foreground">Antes: {before || "Sin nota"}</p>
                <p>{note.note || "Sin nota"}</p>
              </div>
            );
          })}
        </section>
      )}
      {!c.pending && !review ? (
        <Button
          disabled={disabled || c.dirty || !own.changed}
          onClick={() => {
            try {
              correctionFromForm(own.base, own.form, own.base.workout.id);
              setError(null);
              setReview(true);
            } catch (e) {
              setError(message(e));
            }
          }}
        >
          Revisar corrección
        </Button>
      ) : null}
      {review && !c.pending ? (
        <>
          <Button
            disabled={disabled || c.dirty}
            onClick={() => {
              void run(() => controller.submit());
            }}
          >
            Confirmar corrección
          </Button>
          <Button variant="outline" disabled={disabled} onClick={() => setReview(false)}>
            Seguir editando
          </Button>
        </>
      ) : null}
      {c.pending && !c.pending.issue ? (
        <Button
          disabled={disabled || c.dirty}
          onClick={() => {
            void run(() => controller.submit());
          }}
        >
          {c.confirmation ? "Completar limpieza local" : "Reintentar el mismo envío"}
        </Button>
      ) : null}
      {c.pending?.issue === "conflict" ? (
        <Button
          variant="outline"
          disabled={disabled || c.dirty}
          onClick={() => {
            setFetching(true);
            void run(async () => {
              controller.prepareComparison(await readCorrection(workoutId));
            }).finally(() => setFetching(false));
          }}
        >
          Comparar con versión actual
        </Button>
      ) : null}
      {c.pending?.issue === "invalid_input" ? (
        <Button
          variant="outline"
          disabled={disabled || c.dirty}
          onClick={() => {
            void run(async () => {
              await controller.resumeEditing();
              setReview(false);
            });
          }}
        >
          Revisar datos rechazados
        </Button>
      ) : null}
      {c.pending?.issue && ["forbidden", "not_found", "edit_locked"].includes(c.pending.issue) ? (
        <Button
          variant="outline"
          disabled={disabled || c.dirty}
          onClick={() => {
            void run(async () => {
              await controller.retryRejected();
              await controller.submit();
            });
          }}
        >
          Reintentar tras revisar el rechazo
        </Button>
      ) : null}
      {c.dirty ? reread : null}
      {discard ? (
        <>
          <Notice>
            Se descarta esta propuesta local. No se revierten cambios ya confirmados en el servidor.
          </Notice>
          <Button
            variant="destructive"
            disabled={c.busy || c.paused || c.blocked || fetching}
            onClick={() => {
              void run(async () => {
                await controller.discard();
                setFinished(true);
              });
            }}
          >
            Confirmar descarte de corrección
          </Button>
          <Button
            variant="outline"
            disabled={c.busy || c.paused || fetching}
            onClick={() => setDiscard(false)}
          >
            Conservar corrección
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          disabled={c.busy || c.paused || fetching}
          onClick={() => setDiscard(true)}
        >
          Descartar corrección
        </Button>
      )}
      <Button variant="outline" render={<Link href={`/history/${workoutId}/remove`} />}>
        Eliminar entrenamiento
      </Button>
      {back}
    </div>
  );
}
