import { notFound } from "next/navigation";
import { getOwnExercise } from "@/lib/data/exercises";
import { createClient } from "@/lib/supabase/server";
import { updateExerciseAction } from "../actions";
import { ExerciseForm } from "../exercise-form";

export const metadata = { title: "Editar ejercicio · Iron Strength" };

export default async function EditExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exercise = await getOwnExercise(await createClient(), id);
  if (!exercise) notFound(); // también cubre los del catálogo base: son de solo lectura

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Editar ejercicio</h1>
      <ExerciseForm
        editing
        action={updateExerciseAction.bind(null, exercise.id)}
        defaults={{
          name: exercise.name,
          muscleGroup: exercise.muscleGroup,
          equipment: exercise.equipment ?? "Otro",
          progressionIncrementKg: exercise.progressionIncrementKg,
          recordType: exercise.recordType,
        }}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
