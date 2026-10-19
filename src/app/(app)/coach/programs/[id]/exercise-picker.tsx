"use client";

import { useState, useTransition } from "react";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { searchExercises, type CatalogExercise } from "@/lib/coach/routine-editor";
import { addExercisesAction } from "../editor-actions";
import { useRoutineGuard } from "./week-workspace";

export function ExercisePicker({
  programId,
  sessionId,
  exercises,
  count,
  disabled,
}: {
  programId: string;
  sessionId: string;
  exercises: CatalogExercise[];
  count: number;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [muscle, setMuscle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useRoutineGuard();
  const remaining = Math.max(0, 15 - count);
  const matches = searchExercises(exercises, search, muscle);
  const groups = [...new Set(exercises.map((e) => e.muscleGroup))].sort();
  function select(ids: string[]) {
    setSelected(ids);
    guard.setDirty(`${sessionId}-picker`, ids.length > 0);
    setError(null);
    setMessage(null);
  }
  function add() {
    const data = new FormData();
    data.set("programId", programId);
    data.set("sessionId", sessionId);
    data.set("exerciseIds", JSON.stringify(selected));
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await addExercisesAction(data);
        const remainingIds = selected.filter((id) => !result.savedIds.includes(id));
        select(remainingIds);
        setError(result.error);
        setMessage(
          result.savedIds.length
            ? `${result.savedIds.length} ejercicios agregados a la sesión.`
            : null,
        );
        if (!result.error) {
          setOpen(false);
          setSearch("");
          setMuscle("");
        }
      } catch {
        setError(
          "No se pudo confirmar la operación. Recarga y revisa la sesión antes de volver a agregar para evitar duplicados.",
        );
      }
    });
  }
  return (
    <div className="border-t pt-4">
      <Button
        variant="outline"
        disabled={disabled || pending || remaining === 0}
        aria-expanded={open}
        aria-controls={`picker-${sessionId}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Plus aria-hidden />
        Agregar ejercicios
      </Button>
      {remaining === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Límite de 15 ejercicios alcanzado.</p>
      ) : null}
      {open ? (
        <div
          id={`picker-${sessionId}`}
          className="mt-3 flex flex-col gap-3 rounded-md border bg-muted/30 p-3"
        >
          <div>
            <h4 className="text-sm font-semibold">Elige ejercicios</h4>
            <p className="text-xs text-muted-foreground">
              3 series de 8–12 reps. Ajusta la prescripción después de agregar.
            </p>
          </div>
          <fieldset disabled={pending || disabled} className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  aria-label="Buscar ejercicios"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nombre, músculo o equipo"
                  className="h-11 pl-9"
                />
              </div>
              <NativeSelect
                aria-label="Filtrar por músculo"
                value={muscle}
                onChange={(e) => setMuscle(e.target.value)}
                className="h-11 sm:w-44"
              >
                <option value="">Todos los músculos</option>
                {groups.map((group) => (
                  <option key={group}>{group}</option>
                ))}
              </NativeSelect>
            </div>
            {selected.length ? (
              <div className="flex flex-wrap gap-1.5" aria-label="Ejercicios seleccionados">
                {selected.map((id) => (
                  <Button
                    key={id}
                    variant="secondary"
                    className="h-auto min-h-11 max-w-full whitespace-normal text-left text-xs"
                    onClick={() => select(selected.filter((v) => v !== id))}
                    aria-label={`Deseleccionar ${exercises.find((e) => e.id === id)?.name}`}
                  >
                    <span>{exercises.find((e) => e.id === id)?.name}</span>
                    <X className="size-4 shrink-0" aria-hidden />
                  </Button>
                ))}
              </div>
            ) : null}
            <div
              className="max-h-72 overflow-y-auto rounded-md border bg-background"
              aria-label="Catálogo de ejercicios"
            >
              {matches.map((exercise) => (
                <label
                  key={exercise.id}
                  className="flex min-h-14 cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 has-[:checked]:bg-primary/5 has-[:disabled]:cursor-default has-[:disabled]:opacity-50"
                >
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-primary"
                    checked={selected.includes(exercise.id)}
                    disabled={!selected.includes(exercise.id) && selected.length >= remaining}
                    onChange={(e) =>
                      select(
                        e.target.checked
                          ? [...selected, exercise.id]
                          : selected.filter((id) => id !== exercise.id),
                      )
                    }
                  />
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
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {selected.length} seleccionados · {remaining} cupos disponibles
            </span>
            <Button
              onClick={add}
              disabled={pending || disabled || !selected.length || selected.length > remaining}
            >
              {pending ? "Agregando…" : `Agregar seleccionados (${selected.length})`}
            </Button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="mt-2 text-sm text-success">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
