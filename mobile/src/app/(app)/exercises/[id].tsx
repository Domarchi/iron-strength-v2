import type { TypedExerciseDetail } from "../../../../../src/lib/mobile/typed-exercise-contracts";
import { formatTrainingMetrics } from "../../../../../src/domain/training-metrics";
import { RECORD_TYPE_LABELS, SET_TYPE_LABELS } from "../../../lib/training-labels";
import { useCallback, useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { Action, Notice, Page, ScreenIntro, day, s, usePalette } from "../../../components/ui";
import { useSession } from "../../../lib/session";
import { useQuery } from "../../../lib/use-query";
import type { MobileExerciseDetail } from "../../../../../src/lib/mobile/exercise-contracts";

export default function ExerciseDetailRoute() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const { state } = useSession();
  const account = state.status === "authenticated" ? state.session.profile.id : "";
  return (
    <ExerciseDetail
      key={`${account}:${id}`}
      id={typeof id === "string" ? id : ""}
      fromCatalog={from === "catalog"}
    />
  );
}
function ExerciseDetail({ id, fromCatalog }: { id: string; fromCatalog: boolean }) {
  const p = usePalette(),
    { client, state } = useSession();
  const offline = state.status === "authenticated" && state.mode === "offline";
  const request = useCallback(() => {
    if (offline)
      return Promise.reject(new Error("Necesitas conexión para consultar este ejercicio."));
    return client.trainingExerciseDetail(id);
  }, [client, id, offline]);
  const q = useQuery(request);
  const [more, setMore] = useState<{
    base: MobileExerciseDetail | TypedExerciseDetail | null;
    items: (
      | MobileExerciseDetail["history"]["items"][number]
      | TypedExerciseDetail["history"]["items"][number]
    )[];
    nextCursor: string | null;
  }>({ base: null, items: [], nextCursor: null });
  const [loadingMore, setLoadingMore] = useState(false),
    [moreError, setMoreError] = useState<{
      base: MobileExerciseDetail | TypedExerciseDetail;
      message: string;
    } | null>(null);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const detail = !offline && !q.error ? q.value : null;
  const extra = more.base === detail ? more.items : [];
  const rows = [...(detail?.history.items ?? []), ...extra].filter(
    (row, i, all) => all.findIndex((other) => other.id === row.id) === i,
  );
  const cursor = more.base === detail ? more.nextCursor : detail?.history.nextCursor;
  async function loadMore() {
    if (!detail || !cursor || loadingMore || offline) return;
    const base = detail;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await client.trainingExerciseDetail(id, cursor);
      if (!alive.current) return;
      setMore({
        base,
        items: [...extra, ...page.history.items],
        nextCursor: page.history.nextCursor,
      });
    } catch (error) {
      if (alive.current)
        setMoreError({
          base,
          message: error instanceof Error ? error.message : "No pudimos cargar más entrenamientos.",
        });
    } finally {
      if (alive.current) setLoadingMore(false);
    }
  }
  return (
    <Page compact>
      <Action
        label="Volver a la biblioteca"
        quiet
        onPress={() =>
          fromCatalog && router.canGoBack() ? router.back() : router.replace("/exercises")
        }
      />
      {q.loading && !q.value && !offline ? (
        <ActivityIndicator color={p.blue} accessibilityLabel="Cargando ejercicio" />
      ) : null}
      {offline || q.error ? (
        <Notice
          message={q.error ?? "Necesitas conexión para consultar este ejercicio."}
          retry={offline ? undefined : q.retry}
        />
      ) : null}
      {offline || q.error ? (
        <Text style={[s.caption, { color: p.muted }]}>
          La ficha y su historial requieren conexión. No están descargados desde la biblioteca.
        </Text>
      ) : null}
      {detail ? (
        <>
          <ScreenIntro title={detail.exercise.name} />
          <View style={{ gap: 8 }}>
            <Text style={[s.body, { color: p.muted }]}>
              {detail.exercise.muscleGroup} · {detail.exercise.equipment ?? "Sin equipo indicado"}
            </Text>
            {detail.version === 2 && detail.exercise.recordType !== null ? (
              <Text style={[s.caption, { color: p.muted }]}>
                {RECORD_TYPE_LABELS[detail.exercise.recordType]}
              </Text>
            ) : detail.exercise.isBodyweight ? (
              <Text style={[s.caption, { color: p.muted }]}>Peso corporal</Text>
            ) : null}
          </View>
          <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
            Tu historial
          </Text>
          {!rows.length ? (
            <Text style={[s.body, { color: p.muted }]}>Aún no has registrado este ejercicio.</Text>
          ) : null}
          {rows.length && (detail.version === 1 || detail.exercise.recordType === null) ? (
            <Action
              label="Ver progreso de este ejercicio"
              secondary
              onPress={() => router.push({ pathname: "/progress/[id]", params: { id } })}
            />
          ) : null}
          {rows.map((workout) => (
            <View key={workout.id} style={[s.divider, { borderColor: p.border }]}>
              <Text style={[s.label, { color: p.ink }]}>
                {day(workout.date)}
                {workout.sessionLabel ? ` · Sesión ${workout.sessionLabel}` : ""}
              </Text>
              {"exerciseNotes" in workout
                ? workout.exerciseNotes
                    .filter((n) => n.note)
                    .map((n) => (
                      <Text key={n.position} style={[s.body, { color: p.muted }]}>
                        {n.note}
                      </Text>
                    ))
                : null}
              {workout.sets.map((set) => (
                <View key={set.id} style={s.row}>
                  <Text style={[s.body, { color: p.muted }]}>
                    {"setType" in set
                      ? `${SET_TYPE_LABELS[set.setType]} ${set.setNumber}`
                      : set.isWarmup
                        ? "Calentamiento"
                        : `Serie ${set.setNumber}`}
                  </Text>
                  <Text style={[s.label, s.number, { color: p.ink }]}>
                    {"metrics" in set
                      ? formatTrainingMetrics(set.metrics)
                      : `${set.weightKg.toLocaleString("es-CL")} kg × ${set.reps} reps`}
                    {"effort" in set && set.effort !== null ? ` · Esfuerzo ${set.effort}/10` : ""}
                  </Text>
                </View>
              ))}
              <Action
                label={`Ver entrenamiento del ${day(workout.date)}`}
                quiet
                onPress={() =>
                  router.push({ pathname: "/result/[id]", params: { id: workout.id } })
                }
              />
            </View>
          ))}
          {moreError?.base === detail ? <Notice message={moreError.message} /> : null}
          {cursor ? (
            <Action
              label={
                moreError?.base === detail ? "Reintentar más entrenamientos" : "Más entrenamientos"
              }
              secondary
              busy={loadingMore}
              onPress={() => {
                void loadMore();
              }}
            />
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
