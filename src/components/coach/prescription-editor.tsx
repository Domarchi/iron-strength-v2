"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { seriesDraftSummary, type SeriesDraft } from "@/lib/coach/series-draft";
import type { PrescriptionField } from "@/domain/schemas";
import { PrescriptionTargets } from "@/components/workout/prescription-targets";
type Goals = {
  sets: string;
  repsMin: string;
  repsMax: string;
  targetWeightKg: string;
  series?: SeriesDraft[] | null;
};
const fields = [
  ["sets", "Series", 1, 10],
  ["repsMin", "Reps mín.", 1, 100],
  ["repsMax", "Reps máx.", 1, 100],
  ["targetWeightKg", "Peso (kg)", undefined, undefined],
] as const;
const goalFields: PrescriptionField[] = ["sets", "repsMin", "repsMax", "targetWeightKg", "series"];
export function PrescriptionEditor<T extends Goals>({
  name,
  value,
  onChange,
  invalid = false,
  errorId,
}: {
  name: string;
  value: T;
  onChange: (next: T, fields: PrescriptionField[]) => void;
  invalid?: boolean;
  errorId?: string;
}) {
  const [review, setReview] = useState<Goals | null>(null);
  function detail(series: SeriesDraft[]) {
    onChange(
      { ...value, series, sets: String(series.length), ...(seriesDraftSummary(series) ?? {}) },
      goalFields,
    );
  }
  function controls(
    goals: Goals,
    change: (field: (typeof fields)[number][0], text: string) => void,
    suffix: string,
    count = true,
  ) {
    return (
      <div className={`grid min-w-0 gap-2 ${count ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        {fields
          .filter(([f]) => count || f !== "sets")
          .map(([field, label, min, max]) => (
            <label
              key={field}
              className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground"
            >
              {label}
              <Input
                aria-label={`${label} de ${suffix}`}
                aria-invalid={invalid}
                aria-describedby={invalid ? errorId : undefined}
                type={field === "targetWeightKg" ? "text" : "number"}
                inputMode={field === "targetWeightKg" ? "decimal" : "numeric"}
                min={min}
                max={max}
                placeholder={field === "targetWeightKg" ? "Libre" : undefined}
                value={goals[field]}
                onChange={(e) => change(field, e.target.value)}
                className="h-11 min-w-0 bg-background text-base font-medium tabular-nums text-foreground"
              />
            </label>
          ))}
      </div>
    );
  }
  return (
    <div className="prescription-controls min-w-0 space-y-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Objetivos de las series
        <NativeSelect
          aria-label={`Prescripción de ${name}`}
          value={value.series ? "series" : "uniform"}
          onChange={(e) => {
            if (e.target.value === "series") {
              const count = Number(value.sets);
              if (!Number.isInteger(count) || count < 1 || count > 10) return;
              detail(
                Array.from({ length: count }, () => ({
                  repsMin: value.repsMin,
                  repsMax: value.repsMax,
                  targetWeightKg: value.targetWeightKg,
                })),
              );
            } else if (value.series) {
              const first = value.series[0];
              const uniform = { sets: String(value.series.length), ...first };
              if (value.series.some((t) => JSON.stringify(t) !== JSON.stringify(first)))
                setReview(uniform);
              else onChange({ ...value, ...uniform, series: null }, goalFields);
            }
          }}
        >
          <option value="uniform">Todas iguales</option>
          <option value="series">Por serie</option>
        </NativeSelect>
      </label>
      {review ? (
        <section
          role="region"
          aria-label={`Revisar objetivo uniforme de ${name}`}
          className="space-y-3 rounded-lg border border-primary/40 bg-muted/30 p-3"
        >
          <p className="text-sm">
            Hay objetivos diferentes. Revisa los valores que reemplazarán el detalle en todas las
            series.
          </p>
          <PrescriptionTargets series={value.series} />
          {controls(
            review,
            (field, text) => setReview({ ...review, [field]: text }),
            `objetivo uniforme de ${name}`,
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                onChange({ ...value, ...review, series: null }, goalFields);
                setReview(null);
              }}
            >
              Confirmar todas iguales
            </Button>
            <Button variant="outline" onClick={() => setReview(null)}>
              Conservar por serie
            </Button>
          </div>
        </section>
      ) : null}
      {!value.series ? (
        controls(value, (field, text) => onChange({ ...value, [field]: text }, [field]), name)
      ) : (
        <>
          <label className="flex max-w-36 flex-col gap-1 text-xs text-muted-foreground">
            Series
            <Input
              aria-label={`Series de ${name}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              value={value.sets}
              aria-invalid={invalid}
              onChange={(e) => {
                const count = Number(e.target.value);
                if (e.target.value && Number.isInteger(count) && count >= 1 && count <= 10)
                  detail(
                    Array.from({ length: count }, (_, i) => ({
                      ...value.series![Math.min(i, value.series!.length - 1)],
                    })),
                  );
                else onChange({ ...value, sets: e.target.value }, ["sets", "series"]);
              }}
            />
          </label>
          <div className="prescription-target-grid">
            {value.series.map((target, index) => (
              <fieldset key={index} className="rounded-lg border bg-background/50 p-2">
                <legend className="px-1 text-xs font-semibold">Serie {index + 1}</legend>
                {controls(
                  { ...target, sets: "1" },
                  (field, text) =>
                    detail(
                      value.series!.map((t, i) => (i === index ? { ...t, [field]: text } : t)),
                    ),
                  `serie ${index + 1} de ${name}`,
                  false,
                )}
              </fieldset>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Al ampliar se replica la última serie. El descanso sigue siendo por ejercicio o
            superserie.
          </p>
        </>
      )}
    </div>
  );
}
