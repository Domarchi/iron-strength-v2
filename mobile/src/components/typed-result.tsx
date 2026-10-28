import { trainingProgressReturn } from "../lib/training-progress-view";
import { useTrainingPreferences } from "../lib/training-preferences-context";
import { formatWeight, formatDistance } from "../../../src/domain/training-tools";
import { router, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { Action, Brand, Page, s, usePalette, day } from "./ui";
import { WorkoutComments } from "./workout-comments";
import type { TypedWorkout as Result } from "../../../src/lib/mobile/typed-recording-contracts";
import { formatPresentedTrainingMetrics as formatTrainingMetrics } from "../../../src/domain/training-metrics";
const kind = {
  working: "Serie",
  warmup: "Calentamiento",
  failure: "Al fallo",
  drop: "Descendente",
};
export function TypedResult({ workout: w }: { workout: Result["workout"] }) {
  const { preferences } = useTrainingPreferences();
  const p = usePalette(),
    params = useLocalSearchParams<{
      exercise?: string;
      weeks?: string;
      metric?: string;
      progressVersion?: string;
      recordType?: string;
      from?: string;
    }>();
  const back = trainingProgressReturn(
    params,
    w.exercises.flatMap((e) =>
      e.sets.length ? [{ exerciseId: e.exerciseId, recordType: e.prescribed.recordType }] : [],
    ),
  );
  return (
    <Page>
      <Brand />
      {back ? (
        <Action
          label="Volver al progreso"
          secondary
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace({
                  pathname: "/progress/[id]",
                  params: {
                    id: back.exercise,
                    progressVersion: "2",
                    recordType: back.recordType,
                    weeks: String(back.weeks),
                    metric: back.metric,
                  },
                })
          }
        />
      ) : null}
      {params.from === "history" ? (
        <Action
          label="Volver al historial"
          secondary
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/history"))}
        />
      ) : params.from === "summary" ? (
        <Action
          label="Volver al resumen"
          secondary
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/progress"))}
        />
      ) : null}
      <Text style={[s.caption, { color: p.success }]}>ENTRENAMIENTO CONFIRMADO</Text>
      <Text style={[s.heading, { color: p.ink }]}>
        {w.title ?? w.programName ?? "Entrenamiento"}
      </Text>
      <Text style={[s.caption, { color: p.muted }]}>
        {day(w.performedOn)} · {w.summary.workingSets} series · {Math.round(w.durationSeconds / 60)}{" "}
        min
      </Text>
      <View style={{ gap: 6 }}>
        {w.summary.volumeKg > 0 ? (
          <Text style={[s.body, { color: p.ink }]}>
            {formatWeight(w.summary.volumeKg, preferences.value.weightUnit)} de volumen
          </Text>
        ) : null}
        {w.summary.recordedSeconds > 0 ? (
          <Text style={[s.body, { color: p.ink }]}>{w.summary.recordedSeconds} s registrados</Text>
        ) : null}
        {w.summary.distanceMeters > 0 ? (
          <Text style={[s.body, { color: p.ink }]}>
            {formatDistance(w.summary.distanceMeters, preferences.value.distanceUnit)} registrados
          </Text>
        ) : null}
        {w.perceivedEffort != null ? (
          <Text style={[s.body, { color: p.ink }]}>Esfuerzo: {w.perceivedEffort}/10</Text>
        ) : null}
        {w.note ? <Text style={[s.body, { color: p.muted }]}>{w.note}</Text> : null}
      </View>
      {w.exercises.map((e) => (
        <View key={e.id} style={[s.divider, { borderColor: p.border, gap: 8 }]}>
          <Text style={[s.subheading, { color: p.ink }]}>{e.name}</Text>
          {e.prescribedExerciseName && e.exerciseId !== e.prescribedExerciseId ? (
            <Text style={[s.caption, { color: p.blue }]}>
              Alternativa a {e.prescribedExerciseName}
            </Text>
          ) : null}
          {e.athleteNote ? <Text style={[s.body, { color: p.muted }]}>{e.athleteNote}</Text> : null}
          {e.sets.map((set, i) => (
            <View key={set.id} style={{ gap: 2 }}>
              <View style={s.row}>
                <Text style={[s.caption, { color: p.muted }]}>
                  {kind[set.setType]} {i + 1}
                </Text>
                <Text style={[s.label, { color: p.ink, flex: 1, textAlign: "right" }]}>
                  {formatTrainingMetrics(set.metrics, preferences.value)}
                </Text>
              </View>
              {set.effort !== null ? (
                <Text style={[s.caption, { color: p.muted, textAlign: "right" }]}>
                  Esfuerzo {set.effort}/10
                </Text>
              ) : null}
            </View>
          ))}
          {!e.sets.length ? (
            <Text style={[s.caption, { color: p.muted }]}>Sin series registradas</Text>
          ) : null}
        </View>
      ))}
      <Action
        label="Repetir entrenamiento"
        secondary
        onPress={() => router.push({ pathname: "/repeat-recording/[id]", params: { id: w.id } })}
      />
      <Action
        label="Guardar como rutina"
        secondary
        onPress={() => router.push({ pathname: "/save-routine/[id]", params: { id: w.id } })}
      />
      {w.sourceKind === "personal" ? (
        <Action
          label="Actualizar mi rutina"
          quiet
          onPress={() =>
            router.push({ pathname: "/save-routine/[id]", params: { id: w.id, mode: "update" } })
          }
        />
      ) : null}
      <Action label="Volver a mi semana" onPress={() => router.navigate("/")} />
      <Action label="Ver mi historial" secondary onPress={() => router.navigate("/history")} />
      <WorkoutComments workoutId={w.id} />
    </Page>
  );
}
