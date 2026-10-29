"use client";
import { useState } from "react";
import type { TypedCatalogEntry } from "@/lib/mobile/typed-exercise-contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function WebCatalogPicker({
  entries,
  limit,
  disabled,
  onAdd,
}: {
  entries: TypedCatalogEntry[];
  limit: number;
  disabled: boolean;
  onAdd(entries: TypedCatalogEntry[]): Promise<unknown>;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  return (
    <section
      aria-label="Agregar ejercicios del catálogo descargado"
      className="rounded-xl border bg-card p-4 space-y-3"
    >
      <Button
        variant="outline"
        disabled={disabled || busy || limit <= 0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Agregar ejercicios
      </Button>
      {open ? (
        <>
          <Input
            aria-label="Buscar ejercicio descargado"
            placeholder="Buscar ejercicio"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-72 overflow-y-auto space-y-1">
            {entries
              .filter((e) =>
                `${e.name} ${e.muscleGroup} ${e.equipment ?? ""}`
                  .toLocaleLowerCase("es")
                  .includes(search.toLocaleLowerCase("es")),
              )
              .map((e) => (
                <label
                  key={e.id}
                  className="flex min-h-11 items-center gap-3 rounded-lg border p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-5 accent-current"
                    checked={selected.includes(e.id)}
                    disabled={
                      disabled || busy || (!selected.includes(e.id) && selected.length >= limit)
                    }
                    onChange={() =>
                      setSelected((s) =>
                        s.includes(e.id) ? s.filter((id) => id !== e.id) : [...s, e.id],
                      )
                    }
                  />
                  <span>
                    {e.name}
                    <span className="block text-xs text-muted-foreground">{e.muscleGroup}</span>
                  </span>
                </label>
              ))}
          </div>
          {!entries.length ? (
            <p>No hay ejercicios en la descarga. Actualízala con conexión.</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            disabled={disabled || busy || !selected.length || selected.length > limit}
            onClick={() => {
              setBusy(true);
              setError(null);
              void onAdd(selected.map((id) => entries.find((e) => e.id === id)!))
                .then(() => {
                  setSelected([]);
                  setOpen(false);
                })
                .catch((e) =>
                  setError(
                    e instanceof Error
                      ? e.message
                      : "No pudimos agregar los ejercicios. Conservamos tu selección.",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            Agregar selección ({selected.length})
          </Button>
        </>
      ) : null}
    </section>
  );
}
