import { ResultHeading, ResultNote, ResultOptions } from "../../../components/result-presentation";
import { useWorkoutRemoval } from "../../../lib/workout-removal-context";
import { trainingProgressReturn } from "../../../lib/training-progress-view";
import { useTrainingPreferences } from "../../../lib/training-preferences-context";
import { formatWeight } from "../../../../../src/domain/training-tools";
import { TypedResult } from "../../../components/typed-result";
import type { TypedWorkout } from "../../../../../src/lib/mobile/typed-recording-contracts";
import { workoutTitle } from "../../../../../src/domain/workout-title";
import { progressReturn } from "../../../lib/progress-view";
import { useCallback } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Text, View, KeyboardAvoidingView, Platform } from "react-native";
import { WorkoutComments } from "../../../components/workout-comments";
import { Action, Notice, Page, s, usePalette } from "../../../components/ui";
import { useTraining } from "../../../lib/training-context";
import { useSession } from "../../../lib/session";
import { useQuery } from "../../../lib/use-query";
import type { MobileWorkout } from "../../../../../src/lib/mobile/contracts";
import { santiagoDate } from "../../../../../src/domain/dates";
import { setVolume } from "../../../../../src/domain/volume";
export default function Result() {
  const { preferences } = useTrainingPreferences();
  const { removal } = useWorkoutRemoval();
  const p = usePalette(),
    params = useLocalSearchParams<{
      id: string;
      demo?: string;
      exercise?: string;
      weeks?: string;
      metric?: string;
      progressVersion?: string;
      recordType?: string;
      from?: string;
    }>(),
    { id, demo } = params,
    { client } = useSession(),
    { training } = useTraining();
  const sample = demo === "1" ? training.demos.find((x) => x.id === id) : null;
  const request = useCallback(async (): Promise<MobileWorkout | TypedWorkout> => {
    if (demo !== "1") return client.workoutResult(id);
    if (!sample) throw Error("El resultado demo no está disponible en este dispositivo.");
    const payload = sample.payload,
      volume = setVolume(payload.sets),
      group = new Map<number, MobileWorkout["workout"]["exercises"][number]>();
    payload.sets.forEach((set, i) => {
      const ex = group.get(set.position) ?? {
        position: set.position,
        exerciseId: set.exerciseId,
        name: set.exerciseName,
        prescribedExerciseId: set.prescribedExerciseId,
        sets: [],
      };
      ex.sets.push({
        id: `${i}`,
        setNumber: set.setNumber,
        weightKg: set.weightKg,
        reps: set.reps,
        isWarmup: set.isWarmup,
      });
      group.set(set.position, ex);
    });
    return {
      version: 1,
      workout: {
        id: payload.id,
        programName: sample.title,
        sessionLabel: payload.sessionLabel,
        startedAt: payload.startedAt,
        performedOn: santiagoDate(new Date(payload.startedAt)),
        durationSeconds: payload.durationSeconds,
        perceivedEffort: payload.perceivedEffort ?? null,
        note: payload.note ?? null,
        summary: {
          workingSets: payload.sets.filter((s) => !s.isWarmup).length,
          volumeKg: volume.loadKg,
          bodyweightReps: volume.bodyweightReps,
          exerciseCount: group.size,
        },
        exercises: [...group.values()],
      },
    };
  }, [client, id, demo, sample]);
  const q = useQuery(request),
    w = q.value?.version === 1 ? q.value.workout : null,
    back =
      demo !== "1" && w
        ? progressReturn(
            params,
            w.exercises.map((e) => e.exerciseId),
          )
        : null;
  const trainingBack =
    w && demo !== "1"
      ? trainingProgressReturn(
          params,
          w.exercises.map((e) => ({ exerciseId: e.exerciseId, recordType: null })),
        )
      : null;
  if (q.value?.version === 3)
    return (
      <TypedResult workout={q.value.workout} loading={q.loading} error={q.error} retry={q.retry} />
    );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: p.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Page compact>
        {q.error ? <Notice message={q.error} retry={q.retry} /> : null}
        {q.loading && !q.value ? (
          <Text style={[s.body, { color: p.muted }]}>Cargando resultado…</Text>
        ) : null}
        {trainingBack ? (
          <Action
            label="Volver al progreso"
            quiet
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace({
                    pathname: "/progress/[id]",
                    params: {
                      id: trainingBack.exercise,
                      progressVersion: "2",
                      recordType: trainingBack.recordType,
                      weeks: String(trainingBack.weeks),
                      metric: trainingBack.metric,
                    },
                  })
            }
          />
        ) : null}
        {params.from === "history" ? (
          <Action
            label="Volver al historial"
            quiet
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/history"))}
          />
        ) : params.from === "summary" ? (
          <Action
            label="Volver al resumen"
            quiet
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/progress"))}
          />
        ) : null}
        {back && !trainingBack ? (
          <Action
            label="Volver al progreso"
            quiet
            onPress={() =>
              router.navigate({
                pathname: "/progress/[id]",
                params: { id: back.exercise, weeks: String(back.weeks), metric: back.metric },
              })
            }
          />
        ) : null}
        {w ? (
          <>
            <ResultHeading
              title={
                w.sourceKind === "personal" || w.sourceKind === "free"
                  ? workoutTitle(w)
                  : (w.programName ?? "Tu entrenamiento")
              }
              date={w.performedOn}
              workingSets={w.summary.workingSets}
              exerciseCount={w.summary.exerciseCount}
              durationSeconds={w.durationSeconds}
              demo={demo === "1"}
            />
            <View style={{ gap: 6 }}>
              <Text style={[s.body, s.number, { color: p.ink }]}>
                {formatWeight(w.summary.volumeKg, preferences.value.weightUnit)} de volumen
              </Text>
              {w.perceivedEffort ? (
                <Text style={[s.caption, { color: p.muted }]}>
                  Esfuerzo: {w.perceivedEffort}/10
                </Text>
              ) : null}
            </View>
            <Action label="Volver a mi semana" onPress={() => router.navigate("/")} />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <Action label="Ver mi historial" quiet onPress={() => router.navigate("/history")} />
              {demo !== "1" ? (
                <ResultOptions>
                  {demo !== "1" ? (
                    <Action
                      label="Corregir entrenamiento"
                      secondary
                      disabled={
                        q.loading ||
                        !!q.error ||
                        w.id !== id ||
                        removal.busy ||
                        removal.pending?.request.workoutId === w.id
                      }
                      onPress={() =>
                        router.push({ pathname: "/correct-result/[id]", params: { id: w.id } })
                      }
                    />
                  ) : null}
                  {demo !== "1" ? (
                    <Action
                      label="Eliminar entrenamiento"
                      quiet
                      disabled={q.loading || !!q.error || w.id !== id || removal.busy}
                      onPress={() =>
                        router.push({ pathname: "/remove-result/[id]", params: { id: w.id } })
                      }
                    />
                  ) : null}
                  {demo !== "1" ? (
                    <Action
                      label="Repetir entrenamiento"
                      secondary
                      disabled={q.loading || !!q.error || w.id !== id}
                      onPress={() =>
                        router.push({ pathname: "/repeat/[id]", params: { id: w.id } })
                      }
                    />
                  ) : null}
                  {demo !== "1" ? (
                    <Action
                      label="Guardar como rutina"
                      secondary
                      disabled={q.loading || !!q.error || w.id !== id}
                      onPress={() =>
                        router.push({ pathname: "/save-routine/[id]", params: { id: w.id } })
                      }
                    />
                  ) : null}
                  {demo !== "1" && w.sourceKind === "personal" && w.personalRoutineId ? (
                    <Action
                      label="Actualizar mi rutina"
                      quiet
                      disabled={q.loading || !!q.error || w.id !== id}
                      onPress={() =>
                        router.push({
                          pathname: "/save-routine/[id]",
                          params: { id: w.id, mode: "update" },
                        })
                      }
                    />
                  ) : null}
                </ResultOptions>
              ) : null}
            </View>
            <ResultNote note={w.note ?? null} />
            {w.exercises.map((e) => (
              <View key={e.position} style={[s.divider, { borderColor: p.border, gap: 8 }]}>
                <Text style={[s.label, { color: p.ink, fontSize: 17, lineHeight: 23 }]}>
                  {e.name}
                </Text>
                {e.prescribedExerciseName && e.prescribedExerciseId !== e.exerciseId ? (
                  <Text style={[s.caption, { color: p.blue }]}>
                    Alternativa a {e.prescribedExerciseName}
                  </Text>
                ) : null}
                {e.sets.map((set, i) => (
                  <View key={set.id} style={s.row}>
                    <Text style={[s.body, { color: p.muted }]}>
                      {set.isWarmup ? "Calentamiento" : `Serie ${i + 1}`}
                    </Text>
                    <Text style={[s.label, { color: p.ink }]}>
                      {formatWeight(set.weightKg, preferences.value.weightUnit)} × {set.reps} reps
                    </Text>
                  </View>
                ))}
              </View>
            ))}
            {demo !== "1" ? <WorkoutComments key={w.id} workoutId={w.id} /> : null}
          </>
        ) : null}
        {!w ? <Action label="Volver a mi semana" onPress={() => router.navigate("/")} /> : null}
        <Action label="Explorar otra rutina" quiet onPress={() => router.navigate("/train")} />
      </Page>
    </KeyboardAvoidingView>
  );
}
