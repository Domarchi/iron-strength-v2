import { TrainingProgressDetail } from "../../../components/training-progress-detail";
import { useCallback } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { parseProgressWeeks, type ProgressMetric } from "../../../../../src/domain/progress-period";
import { ProgressDetail } from "../../../components/progress-detail";
import { Action, Notice, Page, s, usePalette } from "../../../components/ui";
import { useSession } from "../../../lib/session";
import { useQuery } from "../../../lib/use-query";
export default function ExerciseProgress() {
  const params = useLocalSearchParams<{ progressVersion?: string }>();
  if (params.progressVersion !== undefined && params.progressVersion !== "2")
    return (
      <Page compact>
        <Notice message="Esta versión del progreso no es compatible." />
        <Action label="Volver a mis ejercicios" onPress={() => router.replace("/progress")} />
      </Page>
    );
  return params.progressVersion === "2" ? <TrainingProgressDetail /> : <LegacyExerciseProgress />;
}
function LegacyExerciseProgress() {
  const p = usePalette(),
    { client } = useSession(),
    params = useLocalSearchParams<{ id: string; weeks?: string; metric?: string }>();
  const id = typeof params.id === "string" ? params.id : "",
    request = useCallback(() => client.progressDetail(id), [client, id]),
    q = useQuery(request);
  const value = q.value?.exercise.exerciseId === id ? q.value : null,
    weeks = parseProgressWeeks(typeof params.weeks === "string" ? params.weeks : undefined);
  const metric: ProgressMetric = value?.exercise.isBodyweight
    ? "reps"
    : params.metric === "volume"
      ? "volume"
      : "1rm";
  return (
    <Page compact>
      <Action label="Volver a mis ejercicios" quiet onPress={() => router.navigate("/progress")} />
      {q.error ? <Notice message={q.error} retry={q.retry} /> : null}
      {q.loading && !q.value ? (
        <Text style={[s.body, { color: p.muted }]}>Cargando progreso…</Text>
      ) : null}
      {value && !q.error ? (
        <ProgressDetail
          value={value}
          weeks={weeks}
          metric={metric}
          onWeeks={(n) => router.setParams({ weeks: String(n) })}
          onMetric={(m) => router.setParams({ metric: m })}
        />
      ) : null}
    </Page>
  );
}
