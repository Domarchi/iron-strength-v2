"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { ActionState } from "../actions";

export type PickerExercise = {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string | null;
};

type Defaults = {
  exerciseId?: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  targetWeightKg: number | null;
  note: string | null;
};

export const NEW_DEFAULTS: Defaults = {
  sets: 3,
  repsMin: 8,
  repsMax: 12,
  targetWeightKg: null,
  note: null,
};

// Formulario de prescripción (RF-14): series, rango de repeticiones, peso objetivo y nota.
// Con `exercises` permite elegir el ejercicio (alta); sin él, edita solo la prescripción.
export function PrescriptionForm({
  action,
  hidden,
  exercises,
  defaults,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  exercises?: PickerExercise[];
  defaults: Defaults;
  submitLabel: string;
}) {
  const [search, setSearch] = useState("");
  // Tras agregar con éxito se limpia el buscador (el resto del formulario lo reinicia React).
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.done) setSearch("");
      return result;
    },
    { error: null } as ActionState,
  );
  const idPrefix = useMemo(() => `rx-${Object.values(hidden).join("-")}`, [hidden]);

  const matches = useMemo(() => {
    if (!exercises) return [];
    const needle = search.trim().toLowerCase();
    return exercises
      .filter(
        (e) =>
          !needle ||
          e.name.toLowerCase().includes(needle) ||
          e.muscleGroup.toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [exercises, search]);

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {defaults.exerciseId ? (
        <input type="hidden" name="exerciseId" value={defaults.exerciseId} />
      ) : null}

      {exercises ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-search`}>Ejercicio</Label>
          <Input
            id={`${idPrefix}-search`}
            type="search"
            placeholder="Busca por nombre o grupo muscular"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-11"
          />
          <NativeSelect
            name="exerciseId"
            size={5}
            required
            aria-label="Resultados de la búsqueda"
            className="h-auto min-h-32 py-1"
          >
            {matches.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name} · {exercise.muscleGroup}
                {exercise.equipment ? ` · ${exercise.equipment}` : ""}
              </option>
            ))}
          </NativeSelect>
          {matches.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin resultados.</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-sets`}>Series</Label>
          <Input
            id={`${idPrefix}-sets`}
            name="sets"
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            defaultValue={defaults.sets}
            required
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-min`}>Reps mín.</Label>
          <Input
            id={`${idPrefix}-min`}
            name="repsMin"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            defaultValue={defaults.repsMin}
            required
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-max`}>Reps máx.</Label>
          <Input
            id={`${idPrefix}-max`}
            name="repsMax"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            defaultValue={defaults.repsMax}
            required
            className="h-11"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-weight`}>Peso objetivo (kg, opcional)</Label>
          <Input
            id={`${idPrefix}-weight`}
            name="targetWeightKg"
            inputMode="decimal"
            defaultValue={defaults.targetWeightKg ?? ""}
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-note`}>Nota (opcional)</Label>
          <Input
            id={`${idPrefix}-note`}
            name="note"
            maxLength={500}
            defaultValue={defaults.note ?? ""}
            className="h-11"
          />
        </div>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
