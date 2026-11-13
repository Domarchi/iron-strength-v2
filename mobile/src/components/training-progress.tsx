import { plural } from "../lib/plural";
import { ProgressRefresh } from "./progress-refresh";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { router } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type {
  TrainingExerciseProgress,
  TrainingActivity,
} from "../../../src/domain/training-progress";
import { trainingPeriodSummary } from "../../../src/domain/training-progress";
import {
  primaryTrainingMark,
  formatProgressValue,
  queryPeriod,
} from "../lib/training-progress-view";
import { RECORD_TYPE_LABELS } from "../lib/training-labels";
import { useSession } from "../lib/session";
import { useQuery } from "../lib/use-query";
import { useTrainingPreferences } from "../lib/training-preferences-context";
import { Action, Input, Notice, ScreenIntro, s, day, usePalette } from "./ui";
import { ConnectionStatus } from "./connection-status";
import { ProgressChoice } from "./progress-choice";
import { TrainingSummary } from "./training-summary";
import { TrainingActivityRow } from "./training-activity-row";
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es");
function ExerciseRow({ exercise: e }: { exercise: TrainingExerciseProgress }) {
  const p = usePalette(),
    { preferences } = useTrainingPreferences(),
    mark = primaryTrainingMark(e),
    kind = e.recordType === null ? "Registro anterior" : RECORD_TYPE_LABELS[e.recordType];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver progreso de ${e.name} · ${kind}`}
      onPress={() =>
        router.push({
          pathname: "/progress/[id]",
          params: { id: e.exerciseId, progressVersion: "2", recordType: e.recordType ?? "legacy" },
        })
      }
      style={({ pressed }) => [
        s.divider,
        {
          borderColor: p.border,
          paddingBottom: 16,
          gap: 5,
          backgroundColor: pressed ? p.raised : "transparent",
        },
      ]}
    >
      <Text style={[s.label, { color: p.ink, fontSize: 17, lineHeight: 23 }]}>{e.name}</Text>
      <Text style={[s.caption, { color: p.muted }]}>{kind}</Text>
      {mark ? (
        <Text style={[s.heading, s.number, { color: p.ink, fontSize: 24, lineHeight: 30 }]}>
          {formatProgressValue(mark.metric, mark.value, preferences.value)}
        </Text>
      ) : null}
      <Text style={[s.caption, { color: p.muted }]}>
        {plural(e.workoutCount, "entrenamiento", "entrenamientos")} · {day(e.lastDate)}
      </Text>
    </Pressable>
  );
}
export function TrainingProgress() {
  const p = usePalette(),
    insets = useSafeAreaInsets(),
    { client } = useSession(),
    request = useCallback(() => client.trainingProgress(), [client]),
    q = useQuery(request);
  const [view, setView] = useState<"exercises" | "summary">("exercises"),
    [search, setSearch] = useState(""),
    [mode, setMode] = useState<"month" | "year">("month"),
    [offset, setOffset] = useState(0),
    [anchor, setAnchor] = useState<string | null>(null),
    [muscle, setMuscle] = useState<string | null>(null);
  const query = useDeferredValue(search);
  const exercises = useMemo(
    () => (q.value?.exercises ?? []).filter((e) => normalize(e.name).includes(normalize(query))),
    [q.value, query],
  );
  const summary = useMemo(() => {
    if (!q.value) return null;
    const period = queryPeriod(anchor ?? q.value.today, mode, offset);
    return trainingPeriodSummary(q.value.activity, q.value.today, period.from, period.to);
  }, [q.value, mode, offset, anchor]);
  const activity = useMemo(() => {
    const ids = muscle
      ? summary?.muscles.find((m) => (m.muscleGroup ?? "__unknown__") === muscle)?.workoutIds
      : summary?.workoutIds;
    const selected = new Set(ids ?? []);
    return q.value?.activity.filter((w) => selected.has(w.id)) ?? [];
  }, [q.value, summary, muscle]);
  const data: (TrainingExerciseProgress | TrainingActivity)[] =
    view === "exercises" ? exercises : activity;
  const header = (
    <View style={{ gap: 14 }}>
      <ConnectionStatus />
      <ScreenIntro title="Progreso" />
      {q.error ? (
        <>
          <Notice message={q.error} retry={q.retry} />
          {q.value ? (
            <Text style={[s.caption, { color: p.muted }]}>Datos sin actualizar</Text>
          ) : null}
        </>
      ) : null}
      {q.loading && !q.value ? (
        <Text style={[s.body, { color: p.muted }]}>Cargando marcas…</Text>
      ) : null}
      {q.value ? (
        <>
          <View style={s.row}>
            <View style={{ flexDirection: "row" }}>
              <ProgressChoice
                label="Ejercicios"
                selected={view === "exercises"}
                onPress={() => setView("exercises")}
              />
              <ProgressChoice
                label="Resumen"
                selected={view === "summary"}
                onPress={() => {
                  if (anchor === null && q.value) setAnchor(q.value.today);
                  setView("summary");
                }}
              />
            </View>
            <ProgressRefresh label="Actualizar progreso" busy={q.loading} onPress={q.retry} />
          </View>
          {view === "exercises" ? (
            <Input
              keyboardAppearance={p.dark ? "dark" : "light"}
              selectionColor={p.blue}
              accessibilityLabel="Buscar ejercicio en progreso"
              placeholder="Buscar ejercicio"
              placeholderTextColor={p.muted}
              value={search}
              maxLength={200}
              onChangeText={(value) => setSearch(value.slice(0, 200))}
              style={[s.input, { color: p.ink, borderColor: p.control, backgroundColor: p.field }]}
            />
          ) : (
            <>
              <TrainingSummary
                value={q.value}
                anchor={anchor ?? q.value.today}
                mode={mode}
                offset={offset}
                onMode={(m) => {
                  setMode(m);
                  setAnchor(q.value!.today);
                  setOffset(0);
                  setMuscle(null);
                }}
                onOffset={(d) => {
                  setOffset((v) => v + d);
                  setMuscle(null);
                }}
                evidence={muscle}
                onEvidence={setMuscle}
              />
              <Text style={[s.caption, { color: p.muted }]}>
                {activity.length} {activity.length === 1 ? "resultado" : "resultados"}
              </Text>
            </>
          )}
        </>
      ) : null}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top }}>
      <FlatList
        testID="progress-list"
        data={data}
        keyExtractor={(e) =>
          "exerciseId" in e ? `${e.exerciseId}:${e.recordType ?? "legacy"}` : e.id
        }
        renderItem={({ item }) =>
          "exerciseId" in item ? (
            <ExerciseRow exercise={item} />
          ) : (
            <TrainingActivityRow row={item} from="summary" />
          )
        }
        ListHeaderComponent={header}
        ListEmptyComponent={
          q.value ? (
            <View style={{ gap: 12, paddingVertical: 24 }}>
              <Text style={[s.body, { color: p.muted }]}>
                {view === "summary"
                  ? "No hay entrenamientos con trabajo para este periodo o filtro."
                  : q.value.exercises.length
                    ? "No encontramos ejercicios con ese nombre."
                    : "Tus marcas aparecerán después de guardar tu primer entrenamiento real. Mientras tanto, puedes recorrer las rutinas demo."}
              </Text>
              {view !== "summary" && !q.value.exercises.length ? (
                <Action
                  label="Ir a Entrenar"
                  icon="train"
                  onPress={() => router.navigate("/train")}
                />
              ) : null}
            </View>
          ) : undefined
        }
        contentContainerStyle={{
          width: "100%",
          maxWidth: 560,
          alignSelf: "center",
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: insets.bottom + 28,
        }}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}
