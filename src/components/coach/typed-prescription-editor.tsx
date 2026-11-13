"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  prescriptionInputFields,
  type PrescriptionInput,
  type PrescriptionTargetInput,
} from "@/domain/prescription-input";

type Uniform = Extract<PrescriptionInput, { mode: "uniform" }>;
const labels: Record<keyof PrescriptionTargetInput, string> = {
  repsMin: "Reps mín.",
  repsMax: "Reps máx.",
  targetWeightKg: "Peso (kg)",
  targetDurationSeconds: "Tiempo (s)",
  targetDistanceMeters: "Distancia (m)",
};
const validCount = (text: string) =>
  /^\d+$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= 10;
/** Controlled raw input: preparation and persistence belong to the session controller. */
export function TypedPrescriptionEditor({
  name,
  value,
  onChange,
  invalid = false,
  errorId,
}: {
  name: string;
  value: PrescriptionInput;
  onChange: (next: PrescriptionInput) => void;
  invalid?: boolean;
  errorId?: string;
}) {
  const [review, setReview] = useState<{ source: string; proposal: Uniform } | null>(null);
  const [modeError, setModeError] = useState(false);
  const localErrorId = useId();
  const fingerprint = JSON.stringify(value);
  // A parent's recovery/rebase invalidates a conversion preview from an older document.
  const activeReview = review?.source === fingerprint ? review : null;
  const applicable = prescriptionInputFields(value.recordType);
  const showModeError = modeError && value.mode === "uniform" && !validCount(value.sets);
  const describedBy =
    [invalid ? errorId : undefined, showModeError ? localErrorId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;
  function countControl(input: Uniform, change: (next: Uniform) => void, suffix: string) {
    return (
      <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
        Series
        <Input
          type="text"
          inputMode="numeric"
          maxLength={30}
          aria-label={`Series de ${suffix}`}
          value={input.sets}
          aria-invalid={invalid || showModeError}
          aria-describedby={describedBy}
          onChange={(event) => {
            setModeError(false);
            change({ ...input, sets: event.target.value });
          }}
          className="h-11 min-w-0 bg-background text-base font-medium tabular-nums text-foreground"
        />
      </label>
    );
  }
  function targetControls(
    target: PrescriptionTargetInput,
    change: (target: PrescriptionTargetInput) => void,
    suffix: string,
  ) {
    return applicable.map((field) => (
      <label key={field} className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
        {labels[field]}
        <Input
          type="text"
          inputMode={
            field === "targetWeightKg" || field === "targetDistanceMeters" ? "decimal" : "numeric"
          }
          maxLength={30}
          aria-label={`${labels[field]} de ${suffix}`}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          value={target[field]}
          placeholder={field === "repsMin" || field === "repsMax" ? undefined : "Libre"}
          onChange={(event) => change({ ...target, [field]: event.target.value })}
          className="h-11 min-w-0 bg-background text-base font-medium tabular-nums text-foreground"
        />
      </label>
    ));
  }
  function uniformControls(input: Uniform, change: (next: Uniform) => void, suffix: string) {
    return (
      <div className="prescription-uniform-grid grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
        {countControl(input, change, suffix)}
        {targetControls(input.target, (target) => change({ ...input, target }), suffix)}
      </div>
    );
  }
  return (
    <div
      className="prescription-controls min-w-0 space-y-3"
      data-compact={value.mode === "uniform" && !showModeError && !activeReview}
    >
      <label className="prescription-mode flex flex-col gap-1 text-xs text-muted-foreground">
        Objetivos de las series
        <NativeSelect
          aria-label={`Prescripción de ${name}`}
          value={value.mode}
          disabled={!!activeReview}
          onChange={(event) => {
            setReview(null);
            if (event.target.value === "series" && value.mode === "uniform") {
              if (!validCount(value.sets)) {
                setModeError(true);
                return;
              }
              setModeError(false);
              onChange({
                mode: "series",
                recordType: value.recordType,
                series: Array.from({ length: Number(value.sets) }, () => ({ ...value.target })),
              });
            } else if (event.target.value === "uniform" && value.mode === "series") {
              const proposal: Uniform = {
                mode: "uniform",
                recordType: value.recordType,
                sets: String(value.series.length),
                target: { ...value.series[0] },
              };
              if (
                value.series.every(
                  (target) => JSON.stringify(target) === JSON.stringify(value.series[0]),
                )
              )
                onChange(proposal);
              else setReview({ source: fingerprint, proposal });
            }
          }}
        >
          <option value="uniform">Todas iguales</option>
          <option value="series">Por serie</option>
        </NativeSelect>
      </label>
      {showModeError ? (
        <p id={localErrorId} role="alert" className="text-sm text-destructive">
          Completa una cantidad entre 1 y 10 series antes de cambiar a detalle.
        </p>
      ) : null}
      {activeReview ? (
        <section
          role="region"
          aria-label={`Revisar objetivo uniforme de ${name}`}
          className="space-y-3 rounded-lg border border-primary/40 bg-muted/30 p-3"
        >
          <p className="text-sm">
            Hay objetivos diferentes. Estos valores reemplazarán el detalle en todas las series.
          </p>
          {uniformControls(
            activeReview.proposal,
            (proposal) => setReview({ ...activeReview, proposal }),
            `objetivo uniforme de ${name}`,
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                if (activeReview.source !== JSON.stringify(value)) return;
                onChange(activeReview.proposal);
                setReview(null);
              }}
            >
              Confirmar todas iguales
            </Button>
            <Button type="button" variant="outline" onClick={() => setReview(null)}>
              Conservar por serie
            </Button>
          </div>
        </section>
      ) : null}
      <fieldset disabled={!!activeReview} className="min-w-0 space-y-3">
        {value.mode === "uniform" ? (
          uniformControls(value, onChange, name)
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {value.series.length} {value.series.length === 1 ? "serie" : "series"}
              </p>
              <Button
                type="button"
                variant="outline"
                aria-label={`Añadir serie a ${name}`}
                disabled={value.series.length >= 10}
                onClick={() => {
                  if (value.series.length >= 10) return;
                  onChange({ ...value, series: [...value.series, { ...value.series.at(-1)! }] });
                }}
              >
                <Plus aria-hidden /> Añadir serie
              </Button>
            </div>
            <div className="prescription-target-grid">
              {value.series.map((target, index) => (
                <fieldset key={index} className="min-w-0 rounded-lg border bg-background/50 p-2">
                  <legend className="px-1 text-xs font-semibold">Serie {index + 1}</legend>
                  <div className="flex min-w-0 items-end gap-1">
                    <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
                      {targetControls(
                        target,
                        (next) =>
                          onChange({
                            ...value,
                            series: value.series.map((current, i) =>
                              i === index ? next : current,
                            ),
                          }),
                        `serie ${index + 1} de ${name}`,
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar serie ${index + 1} de ${name}`}
                      disabled={value.series.length <= 1}
                      onClick={() => {
                        if (value.series.length <= 1) return;
                        onChange({ ...value, series: value.series.filter((_, i) => i !== index) });
                      }}
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                </fieldset>
              ))}
            </div>
          </>
        )}
      </fieldset>
    </div>
  );
}
