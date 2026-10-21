"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { filterTemplates } from "@/lib/coach/program-library";
import type { TemplateSummary } from "@/lib/data/programs";
import { DuplicateProgramForm } from "../duplicate-program-form";
export function AdaptBase({
  userId,
  bases,
  studentId,
  selectedBaseId,
}: {
  userId: string;
  bases: TemplateSummary[];
  studentId?: string;
  selectedBaseId?: string;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(selectedBaseId);
  const router = useRouter();
  const base = bases.find((b) => b.id === selected),
    visible = filterTemplates(bases, search);
  return (
    <div className="wrap-anywhere space-y-5">
      <section aria-labelledby="choose-base-heading" className="space-y-3">
        <h2 id="choose-base-heading" className="text-lg font-semibold">
          1. Elige una base
        </h2>
        <label className="block text-sm font-medium">
          Buscar una base
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre, sesión o ejercicio"
          />
        </label>
        {!bases.length ? (
          <EmptyState title="Todavía no hay bases">
            Crea una plantilla en Programas para empezar.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {visible.map((b) => (
              <li key={b.id} className="space-y-2 rounded-xl border bg-card p-4">
                <p className="font-semibold">{b.name}</p>
                <p className="text-xs font-medium text-primary">
                  {b.studentId ? "Programa anterior" : "Plantilla"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {b.weeksCount} semanas · {b.sessionCount} sesiones · {b.exerciseCount} ejercicios
                  · {b.totalSets} series
                </p>
                <Button
                  variant={b.id === selected ? "default" : "outline"}
                  aria-pressed={b.id === selected}
                  aria-label={`Usar ${b.name}`}
                  onClick={() => {
                    setSelected(b.id);
                    const query = new URLSearchParams();
                    if (studentId) query.set("alumno", studentId);
                    query.set("base", b.id);
                    router.replace(`/coach/programs/adapt?${query}`, { scroll: false });
                  }}
                >
                  Usar esta base
                </Button>
              </li>
            ))}
          </ul>
        )}
        {bases.length && !visible.length ? (
          <p className="text-sm text-muted-foreground">
            No hay coincidencias. Prueba otro nombre o ejercicio.
          </p>
        ) : null}
      </section>
      {base ? (
        <section aria-labelledby="copy-base-heading">
          <h2 id="copy-base-heading" className="mb-3 text-lg font-semibold">
            2. Crea tu copia y adáptala
          </h2>
          <DuplicateProgramForm
            key={base.id}
            userId={userId}
            programId={base.id}
            name={base.name}
            targetStudentId={studentId}
            initialOpen
          />
        </section>
      ) : null}
    </div>
  );
}
