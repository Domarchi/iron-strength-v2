"use client";
import { unstable_rethrow } from "next/navigation";
import { useActionState, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { defaultIncrementFor, EQUIPMENT } from "@/domain/exercise-options";
import { MUSCLE_GROUPS } from "@/domain/schemas";
import { RECORD_TYPES, recordTypeSchema, type RecordType } from "@/domain/training-metrics";
import { prescriptionInputFields } from "@/domain/prescription-input";
import { sharedExerciseRecordLabel } from "@/domain/shared-exercise";
import type { ExerciseFormState } from "./actions";
type Defaults = {
  name: string;
  muscleGroup: string;
  equipment: string;
  progressionIncrementKg: number;
  recordType?: RecordType;
};
const mountedSubscribe = () => () => {};
const incrementText = (value: number) => String(value).replace(".", ",");
export function ExerciseForm({
  action,
  defaults,
  submitLabel,
  editing = false,
}: {
  action: (prev: ExerciseFormState, formData: FormData) => Promise<ExerciseFormState>;
  defaults: Defaults;
  submitLabel: string;
  editing?: boolean;
}) {
  const ready = useSyncExternalStore(
    mountedSubscribe,
    () => true,
    () => false,
  );
  const [name, setName] = useState(defaults.name),
    [group, setGroup] = useState(defaults.muscleGroup),
    [equipment, setEquipment] = useState(defaults.equipment),
    [recordType, setRecordType] = useState<NonNullable<RecordType>>(
      defaults.recordType ?? "weight_reps",
    ),
    [increment, setIncrement] = useState(incrementText(defaults.progressionIncrementKg)),
    [feedback, setFeedback] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ExerciseFormState, data: FormData): Promise<ExerciseFormState> => {
      setFeedback(false);
      try {
        return await action(prev, data);
      } catch (error) {
        unstable_rethrow(error);
        return {
          error: "No recibimos confirmación. Busca el nombre en la biblioteca antes de reintentar.",
        };
      }
    },
    { error: null },
  );
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    setFeedback(true);
    if (state.saved) {
      setName(defaults.name);
      setGroup(defaults.muscleGroup);
      setEquipment(defaults.equipment);
      setRecordType(defaults.recordType ?? "weight_reps");
      setIncrement(incrementText(defaults.progressionIncrementKg));
    }
  }
  const effectiveType = editing ? (defaults.recordType ?? null) : recordType;
  const hasLoad = prescriptionInputFields(effectiveType).includes("targetWeightKg");
  const changed = () => setFeedback(false);
  return (
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      aria-busy={!ready || pending}
      aria-label={editing ? "Editar ejercicio" : "Crear ejercicio"}
      className="flex min-w-0 flex-col gap-4"
      noValidate
    >
      <fieldset disabled={!ready || pending} className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="name">Nombre</Label>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              changed();
            }}
            required
            maxLength={100}
            className="h-11"
          />
        </div>
        {editing ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">Tipo de registro</p>
            <p className="text-sm">{sharedExerciseRecordLabel(effectiveType)}</p>
            <p className="text-xs text-muted-foreground">Para cambiarlo, crea otro ejercicio.</p>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="recordType">Tipo de registro</Label>
            <NativeSelect
              id="recordType"
              name="recordType"
              value={recordType}
              onChange={(event) => {
                const parsed = recordTypeSchema.safeParse(event.target.value);
                if (parsed.success && parsed.data !== null) {
                  setRecordType(parsed.data);
                  changed();
                }
              }}
            >
              {RECORD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {sharedExerciseRecordLabel(type)}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="muscleGroup">Grupo muscular</Label>
            <NativeSelect
              id="muscleGroup"
              name="muscleGroup"
              value={group}
              onChange={(event) => {
                setGroup(event.target.value);
                changed();
              }}
            >
              {MUSCLE_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="equipment">Equipamiento</Label>
            <NativeSelect
              id="equipment"
              name="equipment"
              value={equipment}
              onChange={(event) => {
                setEquipment(event.target.value);
                setIncrement(incrementText(defaultIncrementFor(event.target.value)));
                changed();
              }}
            >
              {EQUIPMENT.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        {hasLoad ? (
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="progressionIncrementKg">Incremento de carga (kg)</Label>
            <Input
              id="progressionIncrementKg"
              name="progressionIncrementKg"
              type="text"
              inputMode="decimal"
              value={increment}
              onChange={(event) => {
                setIncrement(event.target.value);
                changed();
              }}
              aria-describedby="increment-hint"
              className="h-11"
            />
            <p id="increment-hint" className="text-xs text-muted-foreground">
              Referencia para la progresión. Mayor que 0 y hasta 20 kg.
            </p>
          </div>
        ) : (
          <input type="hidden" name="progressionIncrementKg" value={increment} />
        )}
      </fieldset>
      {feedback && state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {feedback && state.saved ? (
        <p role="status" className="text-sm text-muted-foreground">
          Ejercicio guardado.
        </p>
      ) : null}
      <Button type="submit" disabled={!ready || pending}>
        {pending ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
