"use client";

import { useState } from "react";
import { Check, ChevronDown, MoreVertical, Plus, SkipForward, Trash2, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKg, formatPrescription } from "@/domain/format";
import type { ContextExercise } from "@/lib/data/workout-context";
import type { DraftExercise } from "@/lib/workout/draft";
import { exerciseProgress, isExerciseComplete, previousForSet } from "@/lib/workout/runner-state";
import { cn } from "@/lib/utils";

const COLUMNS =
  "grid grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_3rem] items-center gap-2";

type Props = {
  exercise: DraftExercise;
  info: ContextExercise | undefined;
  hint: { setId: string; text: string } | null;
  onField: (setIdx: number, field: "weight" | "reps", value: string) => void;
  onToggleDone: (setIdx: number) => void;
  onCopyPrevious: (setIdx: number) => void;
  onToggleWarmup: (setIdx: number) => void;
  onRemoveSet: (setIdx: number) => void;
  onAddSet: () => void;
  onSkip: () => void;
};

function Suggestion({ info }: { info: ContextExercise }) {
  const s = info.suggestion;
  if (!s) return null;
  return (
    <p className="rounded-md border-l-4 border-primary bg-muted px-3 py-2 text-xs text-foreground">
      {s.kind === "increase"
        ? `Sugerencia: sube a ${formatKg(s.weightKg)} y apunta a ${s.reps} repeticiones.`
        : `Sugerencia: mantén ${formatKg(s.weightKg)} y apunta a ${s.reps} repeticiones.`}
    </p>
  );
}

// Un ejercicio de la sesión (RF-53 a RF-57): filas serie · anterior · kg · reps · hecha. Al completarse
// se pliega a un resumen que se puede volver a abrir.
export function ExerciseCard({
  exercise,
  info,
  hint,
  onField,
  onToggleDone,
  onCopyPrevious,
  onToggleWarmup,
  onRemoveSet,
  onAddSet,
  onSkip,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openSet, setOpenSet] = useState<number | null>(null);
  const [reopened, setReopened] = useState(false);

  const { done, total } = exerciseProgress(exercise);
  const complete = isExerciseComplete(exercise);
  const collapsed = complete && !reopened;
  const last = info?.last ?? null;

  if (collapsed) {
    const summary = exercise.sets
      .filter((s) => !s.isWarmup)
      .map((s) => `${s.weight || "0"}×${s.reps}`)
      .join(" · ");
    return (
      <section
        aria-label={exercise.name}
        className="rounded-xl border border-primary/40 bg-card text-card-foreground"
      >
        <button
          type="button"
          aria-expanded={false}
          aria-label={`${exercise.name}, completado. Ver las series`}
          onClick={() => setReopened(true)}
          className="flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{exercise.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{summary}</span>
          </span>
          <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </section>
    );
  }

  return (
    <section aria-label={exercise.name} className="rounded-xl border bg-card text-card-foreground">
      <header className="flex items-start gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-tight font-semibold">{exercise.name}</h2>
          <p className="text-sm text-muted-foreground">
            {formatPrescription(exercise.prescribed)} ·{" "}
            <span className="tabular-nums">
              {done}/{total} hechas
            </span>
          </p>
        </div>
        {complete ? (
          <Button type="button" variant="ghost" onClick={() => setReopened(false)}>
            Plegar
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Más opciones de ${exercise.name}`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="-mr-2"
        >
          <MoreVertical aria-hidden />
        </Button>
      </header>

      {menuOpen ? (
        <div className="px-4 pt-1">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              setMenuOpen(false);
              onSkip();
            }}
          >
            <SkipForward aria-hidden /> Saltar ejercicio
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 px-4 pt-2">
        {info?.note ? <p className="text-sm">{info.note}</p> : null}
        {info ? <Suggestion info={info} /> : null}
        {info && !info.last ? (
          <p className="text-xs text-muted-foreground">Primera vez con este ejercicio.</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 px-4 py-3">
        <div
          className={cn(
            COLUMNS,
            "text-xs font-medium tracking-wide text-muted-foreground uppercase",
          )}
          aria-hidden
        >
          <span className="text-center">Serie</span>
          <span className="text-center">Anterior</span>
          <span className="text-center">Kg</span>
          <span className="text-center">Reps</span>
          <span />
        </div>

        {exercise.sets.map((set, setIdx) => {
          const previous = previousForSet(last, exercise, setIdx);
          const n = setIdx + 1;
          const showHint = hint?.setId === set.id;
          return (
            <div key={set.id} className="flex flex-col gap-1">
              <div
                className={cn(
                  COLUMNS,
                  "-mx-2 rounded-lg px-2 py-1 transition-colors",
                  set.done && "bg-primary/10",
                )}
              >
                <button
                  type="button"
                  aria-label={`Serie ${n} de ${exercise.name}, opciones`}
                  aria-expanded={openSet === setIdx}
                  onClick={() => setOpenSet(openSet === setIdx ? null : setIdx)}
                  className={cn(
                    "grid h-12 place-items-center rounded-lg text-base font-semibold tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    set.isWarmup ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {set.isWarmup ? "C" : n}
                </button>

                {previous ? (
                  <button
                    type="button"
                    aria-label={`Copiar lo anterior en la serie ${n} de ${exercise.name}: ${formatKg(previous.weightKg)} por ${previous.reps}`}
                    onClick={() => onCopyPrevious(setIdx)}
                    className="h-12 truncate rounded-lg text-sm text-muted-foreground tabular-nums outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {`${String(previous.weightKg).replace(".", ",")}×${previous.reps}`}
                  </button>
                ) : (
                  <span className="text-center text-sm text-muted-foreground" aria-hidden>
                    –
                  </span>
                )}

                <Input
                  aria-label={`Peso de la serie ${n} de ${exercise.name} (kg)`}
                  inputMode="decimal"
                  value={set.weight}
                  placeholder={exercise.isBodyweight ? "0" : ""}
                  onChange={(e) => onField(setIdx, "weight", e.target.value)}
                  className="h-12 px-1 text-center text-lg font-semibold tabular-nums md:text-lg"
                />
                <Input
                  aria-label={`Repeticiones de la serie ${n} de ${exercise.name}`}
                  inputMode="numeric"
                  value={set.reps}
                  placeholder={String(previous?.reps ?? exercise.prescribed.repsMin)}
                  onChange={(e) => onField(setIdx, "reps", e.target.value)}
                  className="h-12 px-1 text-center text-lg font-semibold tabular-nums md:text-lg"
                />

                <button
                  type="button"
                  aria-label={`${set.done ? "Desmarcar" : "Marcar como hecha"} la serie ${n} de ${exercise.name}`}
                  aria-pressed={set.done}
                  onClick={() => onToggleDone(setIdx)}
                  className={cn(
                    "grid size-12 place-items-center rounded-xl border-2 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    set.done
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-muted text-muted-foreground hover:border-primary",
                  )}
                >
                  <Check className="size-6" aria-hidden />
                </button>
              </div>

              {showHint ? (
                <p role="alert" className="px-1 text-xs text-destructive">
                  {hint.text}
                </p>
              ) : null}

              {openSet === setIdx ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={set.isWarmup ? "secondary" : "outline"}
                    className="flex-1"
                    aria-label={`Serie ${n} de ${exercise.name} como calentamiento`}
                    aria-pressed={set.isWarmup}
                    onClick={() => onToggleWarmup(setIdx)}
                  >
                    <Flame aria-hidden /> Calentamiento
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-1"
                    aria-label={`Quitar la serie ${n} de ${exercise.name}`}
                    onClick={() => {
                      setOpenSet(null);
                      onRemoveSet(setIdx);
                    }}
                  >
                    <Trash2 aria-hidden /> Quitar
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}

        <Button type="button" variant="ghost" size="lg" className="w-full" onClick={onAddSet}>
          <Plus aria-hidden /> Agregar serie
        </Button>
      </div>
    </section>
  );
}
