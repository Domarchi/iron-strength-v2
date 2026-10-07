"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { WorkoutExerciseRow } from "@/lib/data/workouts";
import { deleteWorkoutAction, updateWorkoutAction, type EditState } from "../actions";

const asText = (n: number) => String(n).replace(".", ",");

export function EditWorkoutForm({
  workoutId,
  exercises,
}: {
  workoutId: string;
  exercises: WorkoutExerciseRow[];
}) {
  const [state, action, pending] = useActionState<EditState, FormData>(
    updateWorkoutAction.bind(null, workoutId),
    {
      error: null,
    },
  );
  const [deleteState, deleteAction, deleting] = useActionState<EditState, FormData>(
    async () => deleteWorkoutAction(workoutId),
    { error: null },
  );

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4" noValidate>
        {exercises.map((exercise) => (
          <Card key={exercise.position}>
            <CardHeader>
              <CardTitle className="text-base">{exercise.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {exercise.sets.map((set) => (
                <fieldset key={set.id} className="flex flex-col gap-2 rounded-lg border p-3">
                  <legend className="px-1 text-xs text-muted-foreground">
                    Serie {set.setNumber}
                  </legend>
                  <input type="hidden" name="setId" value={set.id} />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-xs">
                      Kg
                      <Input
                        name={`weight-${set.id}`}
                        inputMode="decimal"
                        defaultValue={asText(set.weightKg)}
                        aria-label={`Peso de la serie ${set.setNumber} de ${exercise.name} (kg)`}
                        className="h-11 text-center"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      Reps
                      <Input
                        name={`reps-${set.id}`}
                        inputMode="numeric"
                        defaultValue={String(set.reps)}
                        aria-label={`Repeticiones de la serie ${set.setNumber} de ${exercise.name}`}
                        className="h-11 text-center"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name={`warmup-${set.id}`}
                        defaultChecked={set.isWarmup}
                        className="size-5"
                      />
                      Calentamiento
                    </label>
                    <label className="flex min-h-11 items-center gap-2 text-sm text-destructive">
                      <input type="checkbox" name={`remove-${set.id}`} className="size-5" />
                      Quitar esta serie
                    </label>
                  </div>
                </fieldset>
              ))}
            </CardContent>
          </Card>
        ))}
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </form>

      <form
        action={deleteAction}
        onSubmit={(event) => {
          if (!window.confirm("¿Eliminar este entrenamiento? No se puede deshacer."))
            event.preventDefault();
        }}
        className="flex flex-col gap-2 border-t pt-4"
      >
        <Button type="submit" variant="destructive" disabled={deleting}>
          {deleting ? "Eliminando…" : "Eliminar entrenamiento"}
        </Button>
        {deleteState.error ? (
          <p role="alert" className="text-sm text-destructive">
            {deleteState.error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
