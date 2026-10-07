import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getWorkoutContext } from "@/lib/data/workout-context";
import { createClient } from "@/lib/supabase/server";
import { RunnerLoader } from "./runner-loader";

export const metadata: Metadata = { title: "Entrenamiento · Iron Strength" };

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ plannedSessionId: string }>;
}) {
  const { plannedSessionId } = await params;
  const user = await requireUser();
  const result = await getWorkoutContext(await createClient(), user.id, plannedSessionId);

  if (!result.ok && result.reason === "not_found") notFound();

  if (!result.ok) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <p className="font-medium">Esta sesión no está disponible hoy.</p>
          <p className="text-sm text-muted-foreground">
            Solo puedes entrenar las sesiones de la semana en curso de tu programa.
          </p>
          <div>
            <Button render={<Link href="/week" />}>Volver a mi semana</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <RunnerLoader userId={user.id} context={result.context} />;
}
