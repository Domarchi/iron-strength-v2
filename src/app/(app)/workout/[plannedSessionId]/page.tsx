import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getWorkoutContext } from "@/lib/data/workout-context";
import { getAssignedTrainingContext } from "@/lib/data/assigned-training-context";
import { createClient } from "@/lib/supabase/server";
import { WebRunnerGate } from "@/components/training/runner";
export const metadata: Metadata = { title: "Entrenamiento · Iron Strength" };
export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ plannedSessionId: string }>;
}) {
  const { plannedSessionId } = await params;
  if (!z.uuid().safeParse(plannedSessionId).success) notFound();
  const user = await requireUser(),
    db = await createClient();
  const result = await getAssignedTrainingContext(db, user.id, plannedSessionId, undefined, true);
  const context = result.ok ? result.context : null;
  const advanced = context?.exercises.some((e) =>
    [e, ...e.alternatives].some((c) => c.prescribed.recordType !== null),
  );
  const previous =
    context && !advanced
      ? await getWorkoutContext(db, user.id, plannedSessionId, undefined, true)
      : null;
  return (
    <WebRunnerGate
      key={`${user.id}:${plannedSessionId}`}
      userId={user.id}
      sessionId={plannedSessionId}
      context={context}
      legacy={previous?.ok ? previous.context : null}
      canStart={result.ok && result.canStart}
    />
  );
}
