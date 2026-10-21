"use client";

import { isUniformPrescription } from "@/domain/prescription-series";
import { PrescriptionTargets } from "@/components/workout/prescription-targets";
import { Button } from "@/components/ui/button";
import { formatKg, formatPrescription } from "@/domain/format";
import { progressionReason } from "@/domain/progression";
import { workoutSetSchema } from "@/domain/schemas";
import type { ContextExercise } from "@/lib/data/workout-context";
import type { DraftExercise } from "@/lib/workout/draft";
import { previousForSet } from "@/lib/workout/runner-state";

export function ExerciseComparison({
  exercise,
  info,
  onCopyLast,
  onCopySuggestion,
}: {
  exercise: DraftExercise;
  info?: ContextExercise;
  onCopyLast: () => void;
  onCopySuggestion: () => void;
}) {
  const last = info?.last,
    suggestion = isUniformPrescription(exercise.prescribed) ? info?.suggestion : null;
  const working = last?.sets.filter((set) => !set.isWarmup) ?? [];
  const canCopyLast = exercise.sets.some(
    (set, index) => !set.done && previousForSet(last ?? null, exercise, index),
  );
  const canCopySuggestion =
    suggestion &&
    exercise.sets.some((set) => !set.done && !set.isWarmup) &&
    workoutSetSchema.safeParse({ ...suggestion, isWarmup: false }).success;
  const reason = last ? progressionReason(exercise.prescribed, last.sets) : null;
  return (
    <section
      aria-label={`Comparación de ${exercise.name}`}
      className="my-2 rounded-lg border bg-muted/20 px-3"
    >
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
          Comparar prescripción y progreso
        </summary>
        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Prescripción</dt>
            <dd className="mt-1 font-medium">
              {formatPrescription(exercise.prescribed)}
              <PrescriptionTargets series={exercise.prescribed.series} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Última ejecución
              {last
                ? ` · ${new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${last.date}T12:00:00Z`))}`
                : ""}
            </dt>
            <dd className="mt-1">
              {last
                ? working.length
                  ? working
                      .slice(0, 3)
                      .map((set) => `${formatKg(set.weightKg)} × ${set.reps}`)
                      .join(" · ") +
                    (working.length > 3 ? ` · y ${working.length - 3} series más` : "")
                  : "Solo calentamientos registrados"
                : "Aún no tienes una ejecución anterior."}
            </dd>
            {last ? (
              <Button
                variant="ghost"
                className="mt-1 max-w-full whitespace-normal text-left"
                disabled={!canCopyLast}
                onClick={onCopyLast}
              >
                Copiar anterior a pendientes
              </Button>
            ) : null}
          </div>
          {!isUniformPrescription(exercise.prescribed) ? (
            <div>
              <dt className="text-xs text-muted-foreground">Objetivos por serie</dt>
              <dd className="text-xs text-muted-foreground">
                Sigue los objetivos de cada serie. Las series diferentes no usan una sugerencia
                uniforme.
              </dd>
            </div>
          ) : null}
          {suggestion ? (
            <div>
              <dt className="text-xs text-muted-foreground">Sugerencia</dt>
              <dd className="mt-1 flex flex-col gap-1">
                <p className="font-medium text-primary">
                  {formatKg(suggestion.weightKg)} × {suggestion.reps}
                </p>
                <p className="text-xs text-muted-foreground">
                  {reason === "at_top"
                    ? `Completaste las series prescritas y llegaste a ${exercise.prescribed.repsMax} repeticiones en todas las de trabajo. Sube la carga y vuelve al mínimo del rango.`
                    : reason === "missing_sets"
                      ? `La última vez registraste ${working.length} de ${exercise.prescribed.sets} series de trabajo prescritas. Mantén la carga y completa las series.`
                      : `Aún hay series de trabajo por debajo de ${exercise.prescribed.repsMax} repeticiones. Mantén la carga y alcanza el tope del rango.`}
                </p>
              </dd>
              <Button
                variant="ghost"
                className="mt-1 max-w-full whitespace-normal text-left"
                disabled={!canCopySuggestion}
                onClick={onCopySuggestion}
              >
                Copiar sugerencia a pendientes
              </Button>
            </div>
          ) : null}
        </dl>
        <p className="mt-2 pb-3 text-xs text-muted-foreground">
          Copiar conserva las series completadas. La sugerencia se aplica solo a series de trabajo.
        </p>
      </details>
    </section>
  );
}
