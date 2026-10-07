import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { defaultIncrementFor } from "@/domain/exercise-options";
import { MUSCLE_GROUPS } from "@/domain/schemas";
import { listExercises } from "@/lib/data/exercises";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { createExerciseAction, setExerciseArchivedAction } from "./actions";
import { ExerciseForm } from "./exercise-form";

export const metadata = { title: "Ejercicios · Iron Strength" };

type SearchParams = Promise<{ grupo?: string; q?: string; archivados?: string }>;

function href(params: { grupo?: string; q?: string; archivados?: string }) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const query = search.toString();
  return query ? `/coach/exercises?${query}` : "/coach/exercises";
}

async function ExerciseList({ searchParams }: { searchParams: SearchParams }) {
  const { grupo, q, archivados } = await searchParams;
  const group = MUSCLE_GROUPS.find((g) => g === grupo);
  const db = await createClient();
  const exercises = await listExercises(db, {
    group,
    query: q,
    includeArchived: archivados === "1",
    limit: 150,
  });

  return (
    <>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {exercises.length === 150
          ? "Mostrando los primeros 150. Usa el buscador o un grupo."
          : `${exercises.length} ejercicios`}
      </p>
      <ul className="divide-y rounded-lg border">
        {exercises.map((exercise) => (
          <li key={exercise.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p
                className={cn(
                  "truncate text-sm font-medium",
                  exercise.archivedAt && "text-muted-foreground line-through",
                )}
              >
                {exercise.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {exercise.muscleGroup} · {exercise.equipment ?? "Sin equipamiento"} ·{" "}
                {exercise.coachId
                  ? exercise.archivedAt
                    ? "Archivado"
                    : "Propio"
                  : "Catálogo base"}
              </p>
            </div>
            {exercise.coachId ? (
              <div className="flex shrink-0 gap-2">
                {!exercise.archivedAt ? (
                  <Button
                    variant="outline"
                    render={<Link href={`/coach/exercises/${exercise.id}`} />}
                  >
                    Editar
                  </Button>
                ) : null}
                <form action={setExerciseArchivedAction}>
                  <input type="hidden" name="id" value={exercise.id} />
                  <input type="hidden" name="archive" value={String(!exercise.archivedAt)} />
                  <Button type="submit" variant="outline">
                    {exercise.archivedAt ? "Restaurar" : "Archivar"}
                  </Button>
                </form>
              </div>
            ) : null}
          </li>
        ))}
        {exercises.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">No hay ejercicios con ese filtro.</li>
        ) : null}
      </ul>
    </>
  );
}

export default async function ExercisesPage({ searchParams }: { searchParams: SearchParams }) {
  const { grupo, q, archivados } = await searchParams;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Ejercicios</h1>

      <section aria-labelledby="new-heading" className="flex flex-col gap-3">
        <h2 id="new-heading" className="text-lg font-medium">
          Nuevo ejercicio
        </h2>
        <ExerciseForm
          action={createExerciseAction}
          defaults={{
            name: "",
            muscleGroup: "Pecho",
            equipment: "Barra",
            progressionIncrementKg: defaultIncrementFor("Barra"),
          }}
          submitLabel="Crear ejercicio"
        />
      </section>

      <section aria-labelledby="library-heading" className="flex flex-col gap-3">
        <h2 id="library-heading" className="text-lg font-medium">
          Biblioteca
        </h2>
        <form action="/coach/exercises" className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="q">Buscar</Label>
            <Input id="q" name="q" type="search" defaultValue={q ?? ""} className="h-11" />
          </div>
          {grupo ? <input type="hidden" name="grupo" value={grupo} /> : null}
          {archivados ? <input type="hidden" name="archivados" value={archivados} /> : null}
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
        <nav aria-label="Grupo muscular" className="flex flex-wrap gap-2">
          {[undefined, ...MUSCLE_GROUPS].map((group) => (
            <Link
              key={group ?? "todos"}
              href={href({ grupo: group, q, archivados })}
              aria-current={(grupo ?? undefined) === group ? "true" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-4 text-sm",
                (grupo ?? undefined) === group
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground",
              )}
            >
              {group ?? "Todos"}
            </Link>
          ))}
          <Link
            href={href({ grupo, q, archivados: archivados === "1" ? undefined : "1" })}
            className="inline-flex min-h-11 items-center rounded-full border px-4 text-sm text-muted-foreground"
          >
            {archivados === "1" ? "Ocultar archivados" : "Ver archivados"}
          </Link>
        </nav>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
          <ExerciseList searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  );
}
