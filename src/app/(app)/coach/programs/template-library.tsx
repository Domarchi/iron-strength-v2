"use client";
import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { filterTemplates } from "@/lib/coach/program-library";
import type { TemplateSummary } from "@/lib/data/programs";
export function TemplateLibrary({ templates }: { templates: TemplateSummary[] }) {
  const [search, setSearch] = useState("");
  const visible = filterTemplates(templates, search);
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        Buscar plantillas
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nombre, sesión o ejercicio"
          type="search"
        />
      </label>
      <p role="status" className="text-xs text-muted-foreground">
        {visible.length} de {templates.length} plantillas
      </p>
      {!visible.length ? (
        <p className="text-sm text-muted-foreground">
          {templates.length
            ? "No hay coincidencias. Prueba con otro nombre o ejercicio."
            : "Aún no tienes plantillas. Crea la primera arriba."}
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {visible.map((t) => (
            <li key={t.id}>
              <Link
                href={`/coach/programs/${t.id}`}
                className="block min-h-14 p-4 hover:bg-muted/50"
              >
                <span className="block break-words font-semibold">{t.name}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {t.weeksCount} semanas · {t.sessionCount} sesiones · {t.exerciseCount} ejercicios
                  · {t.totalSets} series
                </span>
              </Link>
              {t.sessions.length ? (
                <details className="px-4 pb-3 text-sm">
                  <summary className="min-h-11 cursor-pointer py-3">
                    Vista previa de {t.name}
                  </summary>
                  <ul className="space-y-3">
                    {[...t.sessions]
                      .sort((a, b) => a.weekNumber - b.weekNumber || a.label.localeCompare(b.label))
                      .map((s) => (
                        <li key={`${s.weekNumber}-${s.label}`}>
                          <p className="font-medium">
                            Semana {s.weekNumber} · {s.label}
                            {s.title ? ` · ${s.title}` : ""}
                          </p>
                          <p className="text-muted-foreground">
                            {s.exercises.length} ejercicios ·{" "}
                            {s.exercises.reduce((n, e) => n + e.sets, 0)} series
                          </p>
                          <p className="break-words text-muted-foreground">
                            {s.exercises.map((e) => e.name).join(" · ") || "Sin ejercicios"}
                          </p>
                        </li>
                      ))}
                  </ul>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
