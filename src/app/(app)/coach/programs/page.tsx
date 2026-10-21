import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/layout/page-heading";
import { TemplateLibrary } from "./template-library";
import { Suspense } from "react";
import { listTemplates } from "@/lib/data/programs";
import { createClient } from "@/lib/supabase/server";
import { NewProgramForm } from "./new-program-form";

export const metadata = { title: "Programas · Iron Strength" };

async function TemplateList() {
  const templates = await listTemplates(await createClient());

  return <TemplateLibrary templates={templates} />;
}

export default function ProgramsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Programas"
        eyebrow="Planifica con intención"
        description="Plantillas de entrenamiento."
        action={<Button render={<Link href="/coach/programs/adapt" />}>Adaptar una base</Button>}
      />

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
