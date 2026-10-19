"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, Save, Trash2 } from "lucide-react";
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
import { moveExerciseAction, removeExerciseAction, removeSessionAction } from "../actions";
import { ActionForm } from "../action-form";
import { savePrescriptionsAction } from "../editor-actions";
import { ExercisePicker } from "./exercise-picker";
import { useRoutineGuard } from "./week-workspace";

export function SessionEditor({
  programId,
  session,
  exercises,
}: {
  programId: string;
  session: SessionRow;
  exercises: CatalogExercise[];
}) {
  const [edits, setEdits] = useState<Record<string, PrescriptionDraft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useRoutineGuard();
  const drafts = session.exercises.map((row) => edits[row.id] ?? prescriptionDraft(row));
  const changed = drafts.filter(
    (draft, index) =>
      JSON.stringify(draft) !== JSON.stringify(prescriptionDraft(session.exercises[index])),
  );
  const dirty = changed.length > 0;
  const totalSets = drafts.reduce(
    (sum, row) => sum + (/^\d+$/.test(row.sets) ? Number(row.sets) : 0),
    0,
  );
  const structuralDisabled = pending || guard.dirty;
  function change(draft: PrescriptionDraft, field: keyof PrescriptionDraft, value: string) {
    const next = { ...edits, [draft.id]: { ...draft, [field]: value } };
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
    const validation = validatePrescriptions(changed);
    setErrors(validation.errors);
    setError(validation.error);
    setStatus(null);
    if (validation.error) return;
    const fd = new FormData();
    fd.set("programId", programId);
    fd.set("sessionId", session.id);
    fd.set("rows", JSON.stringify(changed));
    startTransition(async () => {
      try {
        const result = await savePrescriptionsAction(fd);
        setEdits((old) =>
          Object.fromEntries(Object.entries(old).filter(([id]) => !result.savedIds.includes(id))),
        );
        const remaining = changed.filter((row) => !result.savedIds.includes(row.id));
        guard.setDirty(session.id, remaining.length > 0);
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
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base" role="heading" aria-level={3}>
              Sesión {session.label}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {session.exercises.length} ejercicios · {totalSets} series
            </p>
          </div>
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
        <ol className="flex flex-col gap-4">
          {session.exercises.map((exercise, index) => {
            const draft = drafts[index];
            const modified = changed.some((row) => row.id === draft.id);
            const errorId = `error-${exercise.id}`;
            return (
              <li
                key={exercise.id}
                className={`rounded-md border p-3 ${modified ? "border-primary/40 bg-primary/5" : "bg-background"}`}
              >
                <div className="flex items-start justify-between gap-2">
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
                  <div className="flex shrink-0 gap-0.5">
                    <ActionForm
                      action={moveExerciseAction}
                      fields={{
                        id: exercise.id,
                        sessionId: session.id,
                        programId,
                        direction: "up",
                      }}
                      label={<ArrowUp aria-hidden />}
                      ariaLabel={`Subir ${exercise.name}`}
                      disabled={index === 0 || structuralDisabled}
                      size="icon"
                      variant="ghost"
                    />
                    <ActionForm
                      action={moveExerciseAction}
                      fields={{
                        id: exercise.id,
                        sessionId: session.id,
                        programId,
                        direction: "down",
                      }}
                      label={<ArrowDown aria-hidden />}
                      ariaLabel={`Bajar ${exercise.name}`}
                      disabled={index === session.exercises.length - 1 || structuralDisabled}
                      size="icon"
                      variant="ghost"
                    />
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
                  disabled={pending}
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
                    disabled={pending}
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
              </li>
            );
          })}
        </ol>
        {session.exercises.length ? (
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
                  disabled={pending}
                  onClick={() => {
                    if (
                      window.confirm("¿Descartar las prescripciones sin guardar de esta sesión?")
                    ) {
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
              <Button disabled={!dirty || pending} onClick={save}>
                <Save aria-hidden />
                {pending ? "Guardando…" : "Guardar sesión"}
              </Button>
            </div>
          </div>
        ) : null}
        {status ? (
          <p role="status" className="flex items-center gap-2 text-sm text-success">
            <Check className="size-4" aria-hidden />
            {status}
          </p>
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
          disabled={dirty || pending}
        />
      </CardContent>
    </Card>
  );
}
