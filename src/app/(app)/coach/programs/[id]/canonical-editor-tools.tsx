"use client";
import { useState, useSyncExternalStore } from "react";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { TypedPrescriptionEditor } from "@/components/coach/typed-prescription-editor";
import { TrainingPrescriptionSummary } from "@/components/coach/training-prescription-summary";
import { ExerciseThumbnail } from "@/components/workout/exercise-thumbnail";
import { defaultPrescriptionInput } from "@/domain/prescription-input";
import type { CoachCatalogExercise, CoachExerciseRow } from "@/lib/data/coach-programs";
import { searchExercises } from "@/lib/coach/routine-editor";
import {
  buildCoachBulkPreview,
  commonCoachFields,
  type CoachBulkInput,
  type CoachBulkRow,
} from "@/lib/coach/typed-prescription";
import type { CoachEditorDraft } from "@/lib/coach/typed-editor-draft";

type Alternatives = CoachEditorDraft["alternatives"][string];
export function CanonicalAlternatives({
  row,
  value,
  catalog,
  dirty,
  disabled,
  onChange,
  onSave,
  onDiscard,
}: {
  row: CoachExerciseRow;
  value: Alternatives;
  catalog: CoachCatalogExercise[];
  dirty: boolean;
  disabled: boolean;
  onChange: (rows: Alternatives) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const [adding, setAdding] = useState(false),
    [search, setSearch] = useState("");
  const matches = searchExercises(catalog, search, "");
  const choose = (id: string, index: number) => {
    const exercise = catalog.find((exercise) => exercise.id === id);
    if (!exercise) return;
    const existing = value[index];
    if (
      existing &&
      existing.input.recordType !== exercise.recordType &&
      !window.confirm("¿Cambiar de tipo y reiniciar los objetivos de esta alternativa?")
    )
      return;
    const input =
      existing?.input.recordType === exercise.recordType
        ? existing.input
        : defaultPrescriptionInput(exercise.recordType);
    const next = { exerciseId: id, input };
    onChange(
      index < value.length
        ? value.map((current, i) => (i === index ? next : current))
        : [...value, next],
    );
    setAdding(false);
  };
  const select = (index: number) => (
    <label className="flex flex-col gap-1 text-xs">
      Ejercicio alternativo {index + 1}
      <NativeSelect
        aria-label={`Alternativa ${index + 1} de ${row.name}`}
        value={value[index]?.exerciseId ?? ""}
        onChange={(event) => choose(event.target.value, index)}
      >
        <option value="">Selecciona un ejercicio</option>
        {catalog
          .filter(
            (exercise) =>
              exercise.id !== row.exerciseId &&
              (exercise.id === value[index]?.exerciseId ||
                (!value.some((item) => item.exerciseId === exercise.id) &&
                  matches.some((match) => match.id === exercise.id))),
          )
          .map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.name}
            </option>
          ))}
        {value[index] && !catalog.some((exercise) => exercise.id === value[index].exerciseId) ? (
          <option value={value[index].exerciseId}>
            {row.alternatives.find((item) => item.exerciseId === value[index].exerciseId)?.name ??
              "Ejercicio no disponible"}{" "}
            · No disponible
          </option>
        ) : null}
      </NativeSelect>
    </label>
  );
  return (
    <details className="mt-2 border-t" open={dirty ? true : undefined}>
      <summary className="min-h-11 cursor-pointer py-3 text-sm">
        Alternativas de {row.name} ({value.length}/3)
      </summary>
      <fieldset disabled={disabled} className="min-w-0 space-y-3">
        {value.length || adding ? (
          <Input
            type="search"
            aria-label={`Buscar alternativas de ${row.name}`}
            placeholder="Buscar ejercicio"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        ) : null}
        {value.map((alternative, index) => (
          <div key={index} className="min-w-0 space-y-2 rounded-md border p-2">
            {select(index)}
            <TypedPrescriptionEditor
              name={`alternativa ${index + 1} de ${row.name}`}
              value={alternative.input}
              onChange={(input) =>
                onChange(value.map((item, i) => (i === index ? { ...item, input } : item)))
              }
            />
            <Button
              type="button"
              variant="ghost"
              aria-label={`Quitar alternativa ${index + 1} de ${row.name}`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              Quitar alternativa
            </Button>
          </div>
        ))}
        {adding && value.length < 3 ? select(value.length) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={value.length >= 3 || adding}
            aria-label={`Agregar alternativa de ${row.name}`}
            onClick={() => setAdding(true)}
          >
            Agregar alternativa
          </Button>
          {dirty ? (
            <>
              <Button
                type="button"
                aria-label={`Guardar alternativas de ${row.name}`}
                onClick={onSave}
              >
                Guardar alternativas
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Descartar alternativas de ${row.name}`}
                onClick={onDiscard}
              >
                Descartar alternativas
              </Button>
            </>
          ) : null}
        </div>
      </fieldset>
    </details>
  );
}
const bulkControls = [
  {
    key: "sets",
    fields: ["sets"],
    label: "Cambiar series",
    inputs: [["sets", "Series para la selección", "3"]],
  },
  {
    key: "repsMin",
    fields: ["repsMin", "repsMax"],
    label: "Cambiar repeticiones",
    inputs: [
      ["repsMin", "Repeticiones mínimas para la selección", "8"],
      ["repsMax", "Repeticiones máximas para la selección", "12"],
    ],
  },
  {
    key: "targetWeightKg",
    fields: ["targetWeightKg"],
    label: "Cambiar peso",
    inputs: [["targetWeightKg", "Peso para la selección (kg)", ""]],
  },
  {
    key: "targetDurationSeconds",
    fields: ["targetDurationSeconds"],
    label: "Cambiar tiempo",
    inputs: [["targetDurationSeconds", "Tiempo para la selección (segundos)", ""]],
  },
  {
    key: "targetDistanceMeters",
    fields: ["targetDistanceMeters"],
    label: "Cambiar distancia",
    inputs: [["targetDistanceMeters", "Distancia para la selección (metros)", ""]],
  },
  {
    key: "restSeconds",
    fields: ["restSeconds"],
    label: "Cambiar descanso",
    inputs: [["restSeconds", "Descanso para la selección (segundos)", "90"]],
  },
] as const;
export function CanonicalBulkEditor({
  rows,
  value,
  disabled,
  onChange,
  onApply,
  onCancel,
}: {
  rows: CoachExerciseRow[];
  value: CoachBulkInput;
  disabled: boolean;
  onChange: (value: CoachBulkInput) => void;
  onApply: (rows: CoachBulkRow[]) => void;
  onCancel: () => void;
}) {
  const selected = rows.filter((row) => value.ids.includes(row.id)),
    common = commonCoachFields(selected);
  const preview = buildCoachBulkPreview(rows, value);
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-lg border bg-muted/30 p-3">
      <legend className="px-1 text-sm font-semibold">
        Edición múltiple · {value.ids.length} ejercicios
      </legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        {bulkControls
          .filter((control) => control.key === "restSeconds" || common.includes(control.key))
          .map((control) => {
            const enabled = value.fields[control.key] !== undefined;
            return (
              <div key={control.key} className="min-w-0">
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    aria-label={control.label}
                    checked={enabled}
                    onChange={(event) => {
                      const fields = { ...value.fields };
                      for (const [key, , initial] of control.inputs) {
                        if (event.target.checked) fields[key] = initial;
                        else delete fields[key];
                      }
                      onChange({ ...value, fields });
                    }}
                  />
                  {control.label}
                </label>
                <div className="flex min-w-0 gap-2">
                  {control.inputs.map(([key, label, initial]) => (
                    <Input
                      key={key}
                      type="text"
                      inputMode={
                        key === "targetWeightKg" || key === "targetDistanceMeters"
                          ? "decimal"
                          : "numeric"
                      }
                      maxLength={30}
                      aria-label={label}
                      disabled={!enabled}
                      value={value.fields[key] ?? initial}
                      onChange={(event) =>
                        onChange({
                          ...value,
                          fields: { ...value.fields, [key]: event.target.value },
                        })
                      }
                      className="min-w-0"
                    />
                  ))}
                </div>
              </div>
            );
          })}
      </div>
      {Object.keys(value.fields).length && !preview.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {preview.error}
        </p>
      ) : null}
      {preview.ok ? (
        <section role="region" aria-label="Vista previa del lote" className="space-y-2">
          {preview.rows.map((change) => (
            <div key={change.id} className="rounded-md border bg-background p-2">
              <p className="text-sm font-medium">
                {rows.find((row) => row.id === change.id)?.name}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium">Actual</p>
                  <TrainingPrescriptionSummary
                    prescribed={rows.find((row) => row.id === change.id)!.prescribed}
                  />
                </div>
                <div>
                  <p className="text-xs font-medium">Propuesta</p>
                  <TrainingPrescriptionSummary prescribed={change.prescribed} />
                </div>
              </div>
              {value.fields.sets !== undefined ? (
                <p className="text-xs">
                  Series: {rows.find((row) => row.id === change.id)!.prescribed.sets} →{" "}
                  {change.prescribed.sets}
                </p>
              ) : null}
              {value.fields.restSeconds !== undefined ? (
                <p className="text-xs">
                  Descanso: {value.fields.restSeconds || "Libre"}
                  {value.fields.restSeconds ? " s" : ""}
                </p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!preview.ok}
          onClick={() => {
            if (preview.ok) onApply(preview.rows);
          }}
        >
          Aplicar al borrador
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar edición múltiple
        </Button>
      </div>
    </fieldset>
  );
}
const wide = () => !!window.matchMedia?.("(min-width: 1280px)").matches;
function subscribe(changed: () => void) {
  const media = window.matchMedia?.("(min-width: 1280px)");
  media?.addEventListener("change", changed);
  return () => media?.removeEventListener("change", changed);
}
export function CanonicalExercisePicker({
  sessionId,
  sessionLabel,
  sessionTitle,
  catalog,
  selection,
  count,
  visible,
  disabled,
  onChange,
  onAdd,
}: {
  sessionId: string;
  sessionLabel: string;
  sessionTitle?: string | null;
  catalog: CoachCatalogExercise[];
  selection: string[];
  count: number;
  visible: boolean;
  disabled: boolean;
  onChange: (ids: string[]) => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [muscle, setMuscle] = useState("");
  const desktop = useSyncExternalStore(subscribe, wide, () => false),
    shown = visible && (desktop || open || selection.length > 0);
  const remaining = Math.max(0, 15 - count),
    matches = searchExercises(catalog, search, muscle),
    groups = [...new Set(catalog.map((exercise) => exercise.muscleGroup))].sort();
  return (
    <aside aria-label="Biblioteca de ejercicios" className="coach-library border-t p-4">
      <h3 className="text-sm font-semibold">Biblioteca de ejercicios</h3>
      <p className="mb-3 mt-1 text-sm text-muted-foreground">
        Destino: sesión {sessionLabel}
        {sessionTitle ? ` · ${sessionTitle}` : ""}
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || remaining === 0}
        aria-expanded={shown}
        aria-controls={`picker-${sessionId}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Plus aria-hidden />
        Agregar ejercicios
      </Button>
      {remaining === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Límite de 15 ejercicios alcanzado.</p>
      ) : null}
      {shown ? (
        <div className="picker-panel-wrap">
          <div
            id={`picker-${sessionId}`}
            className="picker-panel mt-3 flex flex-col gap-3 rounded-md border bg-muted/30 p-3"
          >
            <div>
              <h4 className="text-sm font-semibold">Elige ejercicios</h4>
              <p className="text-xs text-muted-foreground">
                3 series. Ajusta los objetivos después de agregar.
              </p>
            </div>
            <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-3">
              <div className="picker-search flex min-w-0 flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground"
                  />
                  <Input
                    type="search"
                    aria-label="Buscar ejercicios"
                    placeholder="Nombre, músculo o equipo"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-11 pl-9"
                  />
                </div>
                <NativeSelect
                  aria-label="Filtrar por músculo"
                  value={muscle}
                  onChange={(event) => setMuscle(event.target.value)}
                  className="h-11 sm:w-44"
                >
                  <option value="">Todos los músculos</option>
                  {groups.map((group) => (
                    <option key={group}>{group}</option>
                  ))}
                </NativeSelect>
              </div>
              {selection.length ? (
                <div aria-label="Ejercicios seleccionados" className="flex flex-wrap gap-1.5">
                  {selection.map((id) => (
                    <Button
                      type="button"
                      key={id}
                      variant="secondary"
                      aria-label={`Deseleccionar ${catalog.find((exercise) => exercise.id === id)?.name ?? "ejercicio no disponible"}`}
                      onClick={() => onChange(selection.filter((value) => value !== id))}
                      className="h-auto min-h-11 max-w-full whitespace-normal text-left text-xs"
                    >
                      {catalog.find((exercise) => exercise.id === id)?.name ??
                        "Ejercicio no disponible"}
                      <X aria-hidden className="size-4" />
                    </Button>
                  ))}
                </div>
              ) : null}
              <div
                className="picker-catalog max-h-72 overflow-y-auto rounded-md border bg-background"
                aria-label="Catálogo de ejercicios"
              >
                {matches.map((exercise) => (
                  <label
                    key={exercise.id}
                    className="flex min-h-14 cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-primary"
                      checked={selection.includes(exercise.id)}
                      disabled={!selection.includes(exercise.id) && selection.length >= remaining}
                      onChange={(event) =>
                        onChange(
                          event.target.checked
                            ? [...selection, exercise.id]
                            : selection.filter((id) => id !== exercise.id),
                        )
                      }
                    />
                    <ExerciseThumbnail name={exercise.name} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{exercise.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {exercise.muscleGroup}
                        {exercise.equipment ? ` · ${exercise.equipment}` : ""}
                      </span>
                    </span>
                  </label>
                ))}
                {!matches.length ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Sin resultados. Prueba otro nombre o músculo.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={
                    !selection.length ||
                    selection.length > remaining ||
                    selection.some((id) => !catalog.some((exercise) => exercise.id === id))
                  }
                  onClick={onAdd}
                >
                  Agregar seleccionados ({selection.length})
                </Button>
                {selection.length ? (
                  <Button type="button" variant="ghost" onClick={() => onChange([])}>
                    Cancelar selección de ejercicios
                  </Button>
                ) : null}
              </div>
            </fieldset>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
