import { requireUser } from "@/lib/auth/session";
import { readCorrectionAction } from "../actions";
import { EditWorkoutForm } from "./edit-form";
export const metadata = { title: "Editar entrenamiento · Iron Strength" };
export default async function EditWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }] = await Promise.all([params, requireUser()]);
  const result = await readCorrectionAction(id);
  return (
    <div className="flow-page flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Editar entrenamiento</h1>
      <EditWorkoutForm
        key={id}
        workoutId={id}
        initial={result.ok ? result.value : null}
        initialError={result.ok ? null : result.message}
      />
    </div>
  );
}
