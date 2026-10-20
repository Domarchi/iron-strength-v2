"use client";

import { useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  MoreVertical,
  Plus,
  SkipForward,
  Trash2,
  Flame,
  Timer,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrescription } from "@/domain/format";
import { ExerciseComparison } from "./exercise-comparison";
import type { ContextExercise } from "@/lib/data/workout-context";
import type { DraftExercise } from "@/lib/workout/draft";
import { exerciseProgress, isExerciseComplete, previousForSet } from "@/lib/workout/runner-state";
import { cn } from "@/lib/utils";
import { DEFAULT_REST_SECONDS, formatClock } from "@/domain/rest-timer";
import { ExerciseThumbnail } from "@/components/workout/exercise-thumbnail";

const COLUMNS =
  "grid grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_3rem] items-center gap-2";
const REST_OPTIONS = [0, 30, 60, 90, 120, 180, 300, 600];

type Props = {
  exercise: DraftExercise;
  groupLabel?: string;
  info: ContextExercise | undefined;
  hint: { setId: string; text: string } | null;
  onField: (setIdx: number, field: "weight" | "reps", value: string) => void;
  onToggleDone: (setIdx: number) => void;
  onCopyPrevious: (setIdx: number) => void;
  onCopyLast: () => void;
  onCopySuggestion: () => void;
  onToggleWarmup: (setIdx: number) => void;
  onRemoveSet: (setIdx: number) => void;
  onAddSet: () => void;
  onSkip: () => void;
  onHistory: () => void;
  onRestChange: (seconds: number) => void;
  active: boolean;
  onActivate: () => void;
  onCompleteAndAdvance: (setIdx: number) => void;
};

// Un ejercicio de la sesión (RF-53 a RF-57): filas serie · anterior · kg · reps · hecha. Al completarse
// se pliega a un resumen que se puede volver a abrir.
export function ExerciseCard({
  exercise,
  groupLabel,
  info,
  hint,
  onField,
  onToggleDone,
  onCopyPrevious,
  onCopyLast,
  onCopySuggestion,
  onToggleWarmup,
  onRemoveSet,
  onAddSet,
  onSkip,
  onHistory,
  onRestChange,
  active,
  onActivate,
  onCompleteAndAdvance,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openSet, setOpenSet] = useState<number | null>(null);
  const [reopened, setReopened] = useState(false);
  const repInputs = useRef(new Map<string, HTMLInputElement>());

  const { done, total } = exerciseProgress(exercise);
  const complete = isExerciseComplete(exercise);
  const collapsed = complete && !reopened;
  const last = info?.last ?? null;
  const restSeconds =
    (exercise.supersetId ? exercise.supersetRestSeconds : exercise.restSeconds) ??
    DEFAULT_REST_SECONDS;

  if (collapsed) {
    const summary = exercise.sets
      .filter((s) => !s.isWarmup)
      .map((s) => `${s.weight || "0"}×${s.reps}`)
      .join(" · ");
    return (
      <section
        aria-label={exercise.name}
        data-exercise-id={exercise.sessionExerciseId}
        data-active={active}
        onFocusCapture={onActivate}
        onPointerDownCapture={onActivate}
        className="border-b border-success/40 py-2 text-foreground"
      >
        <button
          type="button"
          aria-expanded={false}
          aria-label={`${exercise.name}, completado. Ver las series`}
          onClick={() => setReopened(true)}
          className="flex min-h-14 w-full items-center gap-3 px-1 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded bg-success text-success-foreground">
            <Check className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{exercise.name}</span>
            {groupLabel ? <span className="block text-xs text-primary">{groupLabel}</span> : null}
            <span className="block truncate text-xs text-muted-foreground">{summary}</span>
          </span>
          <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
        <Button
          variant="ghost"
          onClick={onHistory}
          aria-label={`Ver historial de ${exercise.name}`}
        >
          <History aria-hidden /> Historial
        </Button>
      </section>
    );
  }

  return (
    <section
      aria-label={exercise.name}
      data-exercise-id={exercise.sessionExerciseId}
      data-active={active}
      onFocusCapture={onActivate}
      onPointerDownCapture={onActivate}
      className={cn("scroll-mt-52 border-b pb-5 text-foreground", active && "border-primary/40")}
    >
      <header
        className={cn(
          "flex items-center gap-3 py-3",
          active && "-mx-2 rounded-xl bg-primary/5 px-2",
        )}
      >
        <ExerciseThumbnail name={exercise.name} />
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs text-muted-foreground">
            {[info?.muscleGroup, info?.equipment].filter(Boolean).join(" · ") ||
              "Entrenamiento de fuerza"}
          </p>
          {groupLabel ? (
            <p className="mb-1 text-xs font-semibold text-primary">{groupLabel}</p>
          ) : null}
          <h2 className="text-lg leading-tight font-semibold text-primary">{exercise.name}</h2>
          <p className="mt-1 text-sm font-medium">
            Prescrito · {formatPrescription(exercise.prescribed)}
          </p>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            {active ? <span className="font-semibold text-primary">En curso</span> : null}
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
        <div className="pt-1">
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

      <ExerciseComparison
        exercise={exercise}
        info={info}
        onCopyLast={onCopyLast}
        onCopySuggestion={onCopySuggestion}
      />
      {info?.note ? (
        <details className="my-1 rounded-lg bg-muted/40 px-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-muted-foreground">
            Indicaciones del coach
          </summary>
          <div className="flex flex-col gap-2 pb-3">
            {info.note ? <p className="text-sm">{info.note}</p> : null}
          </div>
        </details>
      ) : null}

      <Button variant="ghost" onClick={onHistory} aria-label={`Ver historial de ${exercise.name}`}>
        <History aria-hidden /> Historial
      </Button>
      <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-primary">
        <Timer className="size-4" aria-hidden />
        <span>{groupLabel ? "Entre rondas" : "Descanso"}</span>
        <select
          aria-label={`Descanso automático de ${exercise.name}`}
          value={restSeconds}
          onChange={(event) => onRestChange(Number(event.target.value))}
          className="min-h-11 min-w-24 rounded border border-input bg-background px-2 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {REST_OPTIONS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds === 0 ? "Desactivado" : formatClock(seconds)}
            </option>
          ))}
          {!REST_OPTIONS.includes(restSeconds) ? (
            <option value={restSeconds}>{formatClock(restSeconds)}</option>
          ) : null}
        </select>
      </label>

      <div className="flex flex-col gap-1 py-2">
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
          const previousText = previous
            ? `${String(previous.weightKg).replace(".", ",")}×${previous.reps}`
            : "";
          const n = setIdx + 1;
          const showHint = hint?.setId === set.id;
          return (
            <div key={set.id} className="flex flex-col gap-1">
              <div
                className={cn(
                  COLUMNS,
                  "-mx-2 rounded px-2 py-1 transition-colors",
                  set.done && "bg-success-muted",
                )}
              >
                <button
                  type="button"
                  aria-label={`Serie ${n} de ${exercise.name}, opciones`}
                  aria-expanded={openSet === setIdx}
                  onClick={() => setOpenSet(openSet === setIdx ? null : setIdx)}
                  className={cn(
                    "grid h-11 place-items-center rounded text-base font-semibold tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    set.isWarmup ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {set.isWarmup ? "C" : n}
                </button>

                {previous ? (
                  <button
                    type="button"
                    aria-label={`Copiar lo anterior en la serie ${n} de ${exercise.name}: ${previousText} (kg × repeticiones)`}
                    disabled={set.done}
                    title={set.done ? "Esta serie ya está completada" : undefined}
                    onClick={() => onCopyPrevious(setIdx)}
                    className="h-11 truncate rounded text-sm text-muted-foreground tabular-nums outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {previousText}
                  </button>
                ) : (
                  <span className="text-center text-sm text-muted-foreground" aria-hidden>
                    –
                  </span>
                )}

                <Input
                  data-set-id={set.id}
                  aria-label={`Peso de la serie ${n} de ${exercise.name} (kg)`}
                  inputMode="decimal"
                  enterKeyHint="next"
                  value={set.weight}
                  placeholder={exercise.isBodyweight ? "0" : ""}
                  onChange={(e) => onField(setIdx, "weight", e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    repInputs.current.get(set.id)?.focus();
                  }}
                  className={cn(
                    "h-12 rounded-md border-transparent bg-muted px-1 text-center text-lg font-semibold tabular-nums md:text-lg dark:bg-muted",
                    set.done && "bg-transparent dark:bg-transparent",
                  )}
                />
                <Input
                  data-set-id={set.id}
                  ref={(node) => {
                    if (node) repInputs.current.set(set.id, node);
                    else repInputs.current.delete(set.id);
                  }}
                  aria-label={`Repeticiones de la serie ${n} de ${exercise.name}`}
                  inputMode="numeric"
                  enterKeyHint="next"
                  value={set.reps}
                  placeholder={String(previous?.reps ?? exercise.prescribed.repsMin)}
                  onChange={(e) => onField(setIdx, "reps", e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    onCompleteAndAdvance(setIdx);
                  }}
                  className={cn(
                    "h-12 rounded-md border-transparent bg-muted px-1 text-center text-lg font-semibold tabular-nums md:text-lg dark:bg-muted",
                    set.done && "bg-transparent dark:bg-transparent",
                  )}
                />

                <button
                  type="button"
                  aria-label={`${set.done ? "Desmarcar" : "Marcar como hecha"} la serie ${n} de ${exercise.name}`}
                  aria-pressed={set.done}
                  onClick={() => onToggleDone(setIdx)}
                  className={cn(
                    "grid size-11 place-items-center rounded outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    set.done
                      ? "bg-success text-success-foreground"
                      : "bg-muted text-muted-foreground hover:bg-primary/15 hover:text-primary",
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

        <Button
          type="button"
          variant="secondary"
          className="mt-2 w-full bg-muted text-foreground"
          onClick={onAddSet}
        >
          <Plus aria-hidden /> Agregar serie
        </Button>
      </div>
    </section>
  );
}
