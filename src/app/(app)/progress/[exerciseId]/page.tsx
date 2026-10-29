import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status-message";
import { ProgressReadFailure } from "@/components/progress/read-failure";
import { TrainingExerciseDetail } from "@/components/progress/typed-exercise-detail";
import { TrainingExerciseList } from "@/components/progress/typed-exercise-list";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getVisibleTrainingProgress } from "@/lib/data/training-review";
import {
  selectTrainingExercise,
  progressSelectionNavigation,
} from "@/lib/navigation/training-progress-selection";
import {
  navigationContext,
  progressHref,
  progressIndexHref,
  studentHref,
} from "@/lib/navigation/training-context";
export const metadata = { title: "Progreso del ejercicio · Iron Strength" };
type Query = {
  semanas?: string | string[];
  vista?: string | string[];
  tipo?: string | string[];
  metrica?: string | string[];
  alumno?: string | string[];
};
export default async function ExerciseProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ exerciseId: string }>;
  searchParams: Promise<Query>;
}) {
  const [{ exerciseId }, query, user] = await Promise.all([params, searchParams, requireUser()]);
  if (!z.uuid().safeParse(exerciseId).success) notFound();
  if (
    query.alumno !== undefined &&
    (typeof query.alumno !== "string" || !z.uuid().safeParse(query.alumno).success)
  )
    notFound();
  if (
    user.role !== "coach" &&
    typeof query.alumno === "string" &&
    query.alumno.toLowerCase() !== user.id.toLowerCase()
  )
    notFound();
  const studentId = typeof query.alumno === "string" ? query.alumno.toLowerCase() : user.id,
    selectedStudent = studentId === user.id ? undefined : studentId,
    navigation = navigationContext(query),
    back = selectedStudent
      ? studentHref(selectedStudent, navigation)
      : progressIndexHref(navigation);
  let review: Awaited<ReturnType<typeof getVisibleTrainingProgress>>;
  try {
    review = await getVisibleTrainingProgress(await createClient(), studentId);
  } catch (error) {
    return (
      <div className="flow-page space-y-4">
        <h1 className="text-xl font-semibold">Progreso del ejercicio</h1>
        <ProgressReadFailure
          error={error}
          retryHref={progressHref(exerciseId, navigation, selectedStudent)}
        />
      </div>
    );
  }
  if (!review) notFound();
  const selection = selectTrainingExercise(review.progress.exercises, exerciseId, query);
  if (selection.kind === "missing") notFound();
  if (selection.kind === "invalid_type")
    return (
      <div className="flow-page space-y-4">
        <h1 className="text-xl font-semibold">Progreso del ejercicio</h1>
        <StatusMessage error>El tipo de registro de este enlace no es válido.</StatusMessage>
        <Button variant="outline" render={<Link href={back} />}>
          Volver
        </Button>
      </div>
    );
  if (selection.kind === "choose_type")
    return (
      <div className="flow-page space-y-4">
        <h1 className="text-xl font-semibold">Elige un registro</h1>
        <TrainingExerciseList
          exercises={selection.choices}
          navigation={navigation}
          studentId={selectedStudent}
        />
      </div>
    );
  return (
    <TrainingExerciseDetail
      selection={selection}
      navigation={progressSelectionNavigation(selection, query.vista)}
      studentId={selectedStudent}
      today={review.today}
      ownerId={review.student.id}
    />
  );
}
