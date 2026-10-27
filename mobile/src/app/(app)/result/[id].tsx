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
import { Icon } from "../../../components/icon";
import { Action, Brand, Notice, Page, day, s, usePalette } from "../../../components/ui";
import { useTraining } from "../../../lib/training-context";
import { useSession } from "../../../lib/session";
import { useQuery } from "../../../lib/use-query";
import type { MobileWorkout } from "../../../../../src/lib/mobile/contracts";
import { santiagoDate } from "../../../../../src/domain/dates";
import { setVolume } from "../../../../../src/domain/volume";
export default function Result() {
  const { preferences } = useTrainingPreferences();
  const p = usePalette(),
    params = useLocalSearchParams<{
      id: string;
      demo?: string;
      exercise?: string;
      weeks?: string;
      metric?: string;
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
  if (q.value?.version === 3) return <TypedResult workout={q.value.workout} />;
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: p.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Page>
        <Brand />
        {q.error ? <Notice message={q.error} retry={q.retry} /> : null}
        {q.loading && !q.value ? (
          <Text style={[s.body, { color: p.muted }]}>Cargando resultado…</Text>
        ) : null}
        {w ? (
          <>
            <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: p.tint,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="check" color={p.success} size={26} />
              </View>
              <Text style={[s.caption, { color: p.success }]}>
                {demo === "1" ? "DEMO GUARDADA EN ESTE DISPOSITIVO" : "ENTRENAMIENTO CONFIRMADO"}
              </Text>
              <Text style={[s.heading, { color: p.ink }]}>Sesión registrada</Text>
              <Text style={[s.body, { color: p.muted }]}>
                {demo === "1"
                  ? "Esta prueba no se envió al coach y no cuenta en tus marcas reales."
                  : "Tu entrenamiento está guardado en tu cuenta y tu coach puede revisarlo."}
              </Text>
            </View>
            <Text style={[s.subheading, { color: p.ink }]}>
              {w.sourceKind === "personal" || w.sourceKind === "free"
                ? workoutTitle(w)
                : (w.programName ?? "Tu entrenamiento")}{" "}
              · {day(w.performedOn)}
            </Text>
            <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
              <Text style={[s.subheading, { color: p.ink }]}>
                {w.summary.workingSets} series · {w.summary.exerciseCount} ejercicios
              </Text>
              <Text style={[s.body, { color: p.muted }]}>
                {formatWeight(w.summary.volumeKg, preferences.value.weightUnit)} de volumen ·{" "}
                {Math.max(1, Math.round(w.durationSeconds / 60))} min
              </Text>
              {w.perceivedEffort ? (
                <Text style={[s.body, { color: p.ink }]}>Esfuerzo: {w.perceivedEffort}/10</Text>
              ) : null}
              {w.note ? <Text style={[s.body, { color: p.ink }]}>{w.note}</Text> : null}
            </View>
            {w.exercises.map((e) => (
              <View
                key={e.position}
                style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}
              >
                <Text style={[s.subheading, { color: p.ink }]}>{e.name}</Text>
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
            {demo !== "1" ? (
              <Action
                label="Repetir entrenamiento"
                secondary
                disabled={q.loading || !!q.error || w.id !== id}
                onPress={() => router.push({ pathname: "/repeat/[id]", params: { id: w.id } })}
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
            {demo !== "1" ? <WorkoutComments key={w.id} workoutId={w.id} /> : null}
          </>
        ) : null}
        {back ? (
          <Action
            label="Volver al progreso"
            onPress={() =>
              router.navigate({
                pathname: "/progress/[id]",
                params: { id: back.exercise, weeks: String(back.weeks), metric: back.metric },
              })
            }
          />
        ) : null}
        <Action label="Volver a mi semana" onPress={() => router.navigate("/")} />
        <Action label="Ver mi historial" secondary onPress={() => router.navigate("/history")} />
        <Action label="Explorar otra rutina" secondary onPress={() => router.navigate("/train")} />
      </Page>
    </KeyboardAvoidingView>
  );
}
