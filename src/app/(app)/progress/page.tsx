import { PageHeading } from "@/components/layout/page-heading";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AchievementsList } from "@/components/achievements/achievements-list";
import { ConstancyStrip } from "@/components/streak/constancy-strip";
import { TrainingExerciseList } from "@/components/progress/typed-exercise-list";
import { ProgressReadFailure } from "@/components/progress/read-failure";
import { requireUser } from "@/lib/auth/session";
import { santiagoDate } from "@/domain/dates";
import { getAchievementsOverview } from "@/lib/data/achievements";
import { getVisibleTrainingProgress } from "@/lib/data/training-review";
import { getStreakSummary } from "@/lib/data/streak";
import { createClient } from "@/lib/supabase/server";
import {
  navigationContext,
  progressIndexHref,
  type TrainingNavigation,
} from "@/lib/navigation/training-context";
export const metadata = { title: "Progreso · Iron Strength" };
async function ExerciseList({ navigation }: { navigation: TrainingNavigation }) {
  const user = await requireUser(),
    db = await createClient();
  let value: {
    review: NonNullable<Awaited<ReturnType<typeof getVisibleTrainingProgress>>>;
    streak: Awaited<ReturnType<typeof getStreakSummary>>;
    achievements: Awaited<ReturnType<typeof getAchievementsOverview>>;
  };
  try {
    const [review, streak] = await Promise.all([
      getVisibleTrainingProgress(db, user.id),
      getStreakSummary(db, user.id, santiagoDate(new Date())),
    ]);
    if (!review) throw Error("No disponible");
    const achievements = await getAchievementsOverview(db, user.id, streak.longest);
    value = { review, streak, achievements };
  } catch (error) {
    return <ProgressReadFailure error={error} retryHref={progressIndexHref(navigation)} />;
  }
  const list = value.review.progress.exercises;
  return (
    <>
      {list.length ? (
        <>
          <ConstancyStrip {...value.streak} />
          <TrainingExerciseList exercises={list} navigation={navigation} />
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-1 pt-6">
            <p className="font-medium">Aquí verás tu progreso.</p>
            <p className="text-sm text-muted-foreground">
              Cuando termines tu primer entrenamiento aparecerán tus ejercicios, tus mejores marcas
              y su evolución.
            </p>
          </CardContent>
        </Card>
      )}
      <AchievementsList {...value.achievements} />
    </>
  );
}
export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{
    semanas?: string | string[];
    vista?: string | string[];
    tipo?: string | string[];
    metrica?: string | string[];
  }>;
}) {
  const navigation = navigationContext(await searchParams);
  return (
    <div className="flow-page flex flex-col gap-4">
      <PageHeading
        title="Progreso"
        eyebrow="Paso a paso"
        description="Marcas personales y constancia."
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
        <ExerciseList navigation={navigation} />
      </Suspense>
    </div>
  );
}
