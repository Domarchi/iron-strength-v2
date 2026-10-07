import Link from "next/link";
import { Suspense } from "react";
import { listTemplates } from "@/lib/data/programs";
import { createClient } from "@/lib/supabase/server";
import { NewProgramForm } from "./new-program-form";

export const metadata = { title: "Programas · Iron Strength" };

async function TemplateList() {
  const templates = await listTemplates(await createClient());

  if (templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aún no tienes plantillas. Crea la primera con el formulario de arriba.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {templates.map((template) => (
        <li key={template.id}>
          <Link
            href={`/coach/programs/${template.id}`}
            className="flex min-h-14 items-center justify-between gap-3 p-3 hover:bg-muted/50"
          >
            <span className="min-w-0 truncate font-medium">{template.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {template.weeksCount} {template.weeksCount === 1 ? "semana" : "semanas"} ·{" "}
              {template.sessionCount} {template.sessionCount === 1 ? "sesión" : "sesiones"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function ProgramsPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Programas</h1>

      <section aria-labelledby="new-heading" className="flex flex-col gap-3">
        <h2 id="new-heading" className="text-lg font-medium">
          Nueva plantilla
        </h2>
        <NewProgramForm />
      </section>

      <section aria-labelledby="templates-heading" className="flex flex-col gap-3">
        <h2 id="templates-heading" className="text-lg font-medium">
          Plantillas
        </h2>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
          <TemplateList />
        </Suspense>
      </section>
    </div>
  );
}
