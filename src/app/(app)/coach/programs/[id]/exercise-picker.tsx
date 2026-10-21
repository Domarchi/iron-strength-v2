"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExerciseThumbnail } from "@/components/workout/exercise-thumbnail";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { searchExercises, type CatalogExercise } from "@/lib/coach/routine-editor";
import type { AdditionRequest } from "@/lib/coach/routine-additions";
import type { EditorResult } from "../editor-actions";
import { addExercisesAction } from "../editor-actions";

const libraryQuery = "(min-width: 1280px)";
function subscribeLayout(changed: () => void) {
  if (!window.matchMedia) return () => {};
  const query = window.matchMedia(libraryQuery);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
}
const wideLayout = () => Boolean(window.matchMedia?.(libraryQuery).matches);
const serverLayout = () => false;

export function ExercisePicker({
  programId,
  sessionId,
  exercises,
  count,
  disabled,
  visible = true,
  getRevision,
  request,
  selected,
  conflict,
  onChange,
  onResult,
}: {
  getRevision: () => number;
  request: AdditionRequest | null;
  selected: string[];
  conflict: boolean;
  onChange: (selected: string[], request: AdditionRequest | null) => boolean;
  onResult: (result: EditorResult) => void;
  programId: string;
  sessionId: string;
  exercises: CatalogExercise[];
  count: number;
  disabled: boolean;
  visible?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wide = useSyncExternalStore(subscribeLayout, wideLayout, serverLayout);
  const shown = visible && (wide || open || !!request || selected.length > 0);
  const [search, setSearch] = useState("");
  const [muscle, setMuscle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const remaining = Math.max(0, 15 - count);
  const matches = searchExercises(exercises, search, muscle);
  const groups = [...new Set(exercises.map((e) => e.muscleGroup))].sort();
  function select(ids: string[]) {
    onChange(ids, null);
    setError(null);
    setMessage(null);
  }
  function add() {
    const next = request ?? {
      id: crypto.randomUUID(),
      revision: getRevision(),
      items: selected.map((exerciseId) => ({ id: crypto.randomUUID(), exerciseId })),
    };
    if (!onChange(selected, next)) {
      setError(
        "No se pudo proteger el intento en este dispositivo. Libera espacio y confirma el agregado para continuar.",
      );
      return;
    }
    const data = new FormData();
    data.set("programId", programId);
    data.set("sessionId", sessionId);
    data.set("requestId", next.id);
    data.set("revision", String(next.revision));
    data.set("items", JSON.stringify(next.items));
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await addExercisesAction(data);
        onResult(result);
        setError(result.error);
        if (!result.error) {
          onChange([], null);
          setMessage(`${next.items.length} ejercicios agregados a la sesión.`);
          setOpen(false);
          setSearch("");
          setMuscle("");
        } else if (!result.uncertain && !result.conflict) onChange(selected, null);
      } catch {
        setError(
          "No recibimos confirmación. El lote sigue guardado aquí; confirma el mismo agregado sin duplicarlo.",
        );
      }
    });
  }
  return (
    <aside aria-label="Biblioteca de ejercicios" className="coach-library border-t p-4">
      <h3 className="mb-2 text-sm font-bold">Biblioteca de ejercicios</h3>
      <Button
        variant="outline"
        disabled={disabled || pending || remaining === 0}
        aria-expanded={shown}
        aria-controls={`picker-${sessionId}`}
        onClick={() => setOpen((value) => wide || !value)}
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
                3 series de 8–12 reps. Ajusta la prescripción después de agregar.
              </p>
            </div>
            <fieldset
              disabled={pending || disabled || !!request}
              className="flex min-w-0 flex-col gap-3"
            >
              <div className="picker-search flex flex-col gap-2 sm:flex-row">
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
                className="picker-catalog max-h-72 overflow-y-auto rounded-md border bg-background"
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
            </fieldset>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {selected.length} seleccionados · {remaining} cupos disponibles
              </span>
              <Button
                onClick={add}
                disabled={
                  pending ||
                  disabled ||
                  conflict ||
                  (!request && (!selected.length || selected.length > remaining))
                }
              >
                {pending
                  ? "Agregando…"
                  : request
                    ? "Confirmar agregado"
                    : `Agregar seleccionados (${selected.length})`}
              </Button>
            </div>
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
    </aside>
  );
}
