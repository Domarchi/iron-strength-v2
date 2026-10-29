import { requireUser } from "@/lib/auth/session";
import { readRemovalAction } from "../actions";
import { RemoveWorkoutForm } from "./remove-form";
export const metadata = { title: "Eliminar entrenamiento · Iron Strength" };
export default async function RemoveWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }] = await Promise.all([params, requireUser()]);
  const result = await readRemovalAction(id);
  return (
    <div className="flow-page flex flex-col gap-4">
      <RemoveWorkoutForm
        key={id}
        workoutId={id}
        initial={result.ok ? result.value : null}
        initialError={result.ok ? null : result.message}
      />
    </div>
  );
}
