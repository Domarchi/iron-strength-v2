"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { defaultIncrementFor, EQUIPMENT } from "@/domain/exercise-options";
import { MUSCLE_GROUPS } from "@/domain/schemas";
import type { ExerciseFormState } from "./actions";

type Defaults = {
  name: string;
  muscleGroup: string;
  equipment: string;
  progressionIncrementKg: number;
};

export function ExerciseForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: ExerciseFormState, formData: FormData) => Promise<ExerciseFormState>;
  defaults: Defaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [increment, setIncrement] = useState(String(defaults.progressionIncrementKg));
  const formRef = useRef<HTMLFormElement>(null);
  const [lastSaved, setLastSaved] = useState<unknown>(null);

  // Tras crear un ejercicio, limpia el formulario (React ya lo reinicia; aquí también el incremento).
  if (state.saved && lastSaved !== state) {
    setLastSaved(state);
    setIncrement(String(defaults.progressionIncrementKg));
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nombre</Label>
        <Input
          id="name"
          name="name"
          defaultValue={defaults.name}
          required
          maxLength={100}
          className="h-11"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="muscleGroup">Grupo muscular</Label>
          <NativeSelect id="muscleGroup" name="muscleGroup" defaultValue={defaults.muscleGroup}>
            {MUSCLE_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="equipment">Equipamiento</Label>
          <NativeSelect
            id="equipment"
            name="equipment"
            defaultValue={defaults.equipment}
            onChange={(event) => setIncrement(String(defaultIncrementFor(event.target.value)))}
          >
            {EQUIPMENT.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="progressionIncrementKg">Incremento de la sugerencia de peso (kg)</Label>
        <Input
          id="progressionIncrementKg"
          name="progressionIncrementKg"
          type="number"
          inputMode="decimal"
          step="0.25"
          min="0.25"
          max="20"
          value={increment}
          onChange={(event) => setIncrement(event.target.value)}
          aria-describedby="increment-hint"
          className="h-11"
        />
        <p id="increment-hint" className="text-xs text-muted-foreground">
          Cuánto se sugiere subir cuando el alumno llega al tope de repeticiones. Habitual: 2,5 kg
          con barra; 1 a 2 kg con mancuernas o máquinas.
        </p>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="text-sm text-muted-foreground">
          Ejercicio guardado.
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
