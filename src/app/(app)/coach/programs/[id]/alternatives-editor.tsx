"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { searchExercises, type CatalogExercise } from "@/lib/coach/routine-editor";
import type { AlternativeDraft } from "@/lib/coach/routine-alternatives";
export function AlternativesEditor({
  name,
  originalId,
  rows,
  catalog,
  dirty,
  disabled,
  locked,
  saving,
  onChange,
  onSave,
  onDiscard,
}: {
  name: string;
  originalId: string;
  rows: AlternativeDraft[];
  catalog: CatalogExercise[];
  dirty: boolean;
  disabled: boolean;
  locked: boolean;
  saving: boolean;
  onChange: (rows: AlternativeDraft[]) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const [search, setSearch] = useState("");
  const matches = searchExercises(catalog, search, "");
  return (
    <details className="mt-2 border-t" open={dirty ? true : undefined}>
      <summary className="min-h-11 cursor-pointer py-3 text-sm">
        Alternativas de {name} ({rows.length}/3)
      </summary>
      <p className="mb-2 text-xs text-muted-foreground">
        El alumno podrá elegir una antes de completar series. Cada alternativa tiene su propia
        prescripción.
      </p>
      <fieldset disabled={disabled || locked} className="min-w-0 space-y-3">
        {rows.length ? (
          <Input
            aria-label={`Buscar alternativas de ${name}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ejercicio"
            className="h-11"
          />
        ) : null}
        {rows.map((row, index) => (
          <div key={index} className="rounded border p-2">
            <label className="flex flex-col gap-1 text-xs">
              Ejercicio alternativo {index + 1}
              <NativeSelect
                aria-label={`Alternativa ${index + 1} de ${name}`}
                value={row.exerciseId}
                onChange={(e) =>
                  onChange(
                    rows.map((r, i) => (i === index ? { ...r, exerciseId: e.target.value } : r)),
                  )
                }
              >
                <option value="">Selecciona un ejercicio</option>
                {catalog
                  .filter(
                    (e) =>
                      e.id !== originalId &&
                      (e.id === row.exerciseId ||
                        (matches.some((m) => m.id === e.id) &&
                          !rows.some((r) => r.exerciseId === e.id))),
                  )
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                {row.exerciseId && !catalog.some((e) => e.id === row.exerciseId) ? (
                  <option value={row.exerciseId}>Ejercicio no disponible</option>
                ) : null}
              </NativeSelect>
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["sets", "Series"],
                  ["repsMin", "Reps mín."],
                  ["repsMax", "Reps máx."],
                  ["targetWeightKg", "Peso (kg)"],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="min-w-0 text-xs">
                  {label}
                  <Input
                    aria-label={`${label} de alternativa ${index + 1} de ${name}`}
                    inputMode={field === "targetWeightKg" ? "decimal" : "numeric"}
                    value={row[field]}
                    onChange={(e) =>
                      onChange(
                        rows.map((r, i) => (i === index ? { ...r, [field]: e.target.value } : r)),
                      )
                    }
                    className="mt-1 h-11 min-w-0"
                  />
                </label>
              ))}
            </div>
            <Button
              variant="ghost"
              className="mt-1"
              aria-label={`Quitar alternativa ${index + 1} de ${name}`}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              Quitar alternativa
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          disabled={rows.length >= 3}
          onClick={() =>
            onChange([
              ...rows,
              { exerciseId: "", sets: "3", repsMin: "8", repsMax: "12", targetWeightKg: "" },
            ])
          }
        >
          Agregar alternativa de {name}
        </Button>
      </fieldset>
      {dirty ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={disabled} onClick={onSave}>
            Guardar alternativas de {name}
          </Button>
          <Button variant="outline" disabled={saving} onClick={onDiscard}>
            Descartar alternativas pendientes
          </Button>
        </div>
      ) : null}
    </details>
  );
}
