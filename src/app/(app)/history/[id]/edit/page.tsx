import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { santiagoDate } from "@/domain/dates";
import { isWorkoutEditable } from "@/domain/edit-window";
import { requireUser } from "@/lib/auth/session";
import { getWorkoutDetail } from "@/lib/data/workouts";
import { createClient } from "@/lib/supabase/server";
import { EditWorkoutForm } from "./edit-form";

export const metadata = { title: "Editar entrenamiento · Iron Strength" };

export default async function EditWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const workout = await getWorkoutDetail(await createClient(), id);
  if (!workout || workout.studentId !== user.id) notFound();

  if (!isWorkoutEditable(workout.performedOn, santiagoDate(new Date()))) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <p className="font-medium">Este entrenamiento ya no se puede modificar.</p>
          <p className="text-sm text-muted-foreground">
            Solo puedes editarlo hasta 7 días después de su fecha.
          </p>
          <div>
            <Button render={<Link href={`/history/${id}`} />}>Volver</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Editar entrenamiento</h1>
      <EditWorkoutForm workoutId={id} exercises={workout.exercises} />
    </div>
  );
}
