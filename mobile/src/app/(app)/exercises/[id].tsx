import type { TypedExerciseDetail } from "../../../../../src/lib/mobile/typed-exercise-contracts";
import { formatTrainingMetrics } from "../../../../../src/domain/training-metrics";
import { RECORD_TYPE_LABELS, SET_TYPE_LABELS } from "../../../lib/training-labels";
import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { Action, Notice, Page, ScreenIntro, day, s, usePalette } from "../../../components/ui";
import { ExerciseGuideCard } from "../../../components/exercise-guide-card";
import { useSession } from "../../../lib/session";
import { useTrainingExerciseQuery } from "../../../lib/training-download-query";
import { downloadedAt } from "../../../lib/offline-week";
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
  const q = useTrainingExerciseQuery(id);
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
  const detail = !q.error ? q.value : null;
  const extra = more.base === detail ? more.items : [];
  const rows = [...(detail?.history.items ?? []), ...extra].filter(
    (row, i, all) => all.findIndex((other) => other.id === row.id) === i,
  );
  const cursor = more.base === detail ? more.nextCursor : detail?.history.nextCursor;
  const progressTypes = [
    ...new Set(
      rows.flatMap((w) => w.sets.map((set) => ("metrics" in set ? set.metrics.recordType : null))),
    ),
  ];
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
      {q.loading && !q.value ? (
        <ActivityIndicator color={p.blue} accessibilityLabel="Cargando ejercicio" />
      ) : null}
      {q.error ? (
        <Notice
          message={q.error ?? "Necesitas conexión para consultar este ejercicio."}
          retry={offline ? undefined : q.retry}
        />
      ) : null}
      {q.downloadedAt ? (
        <Text style={[s.caption, { color: p.muted }]}>
          Historial descargado · {downloadedAt(q.downloadedAt)}
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
          <ExerciseGuideCard
            exercise={{
              name: detail.exercise.name,
              muscleGroup: detail.exercise.muscleGroup,
              equipment: detail.exercise.equipment,
              isBodyweight: detail.exercise.isBodyweight,
            }}
          />
          <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
            Tu historial
          </Text>
          {!rows.length ? (
            <Text style={[s.body, { color: p.muted }]}>Aún no has registrado este ejercicio.</Text>
          ) : null}
          {!offline
            ? progressTypes.map((kind) => (
                <Action
                  key={kind ?? "legacy"}
                  label={
                    progressTypes.length === 1
                      ? "Ver progreso de este ejercicio"
                      : `Ver progreso · ${kind === null ? "Registro anterior" : RECORD_TYPE_LABELS[kind]}`
                  }
                  secondary
                  onPress={() =>
                    router.push({
                      pathname: "/progress/[id]",
                      params: {
                        id,
                        progressVersion: "2",
                        recordType: kind ?? "legacy",
                        from: "exercise",
                      },
                    })
                  }
                />
              ))
            : null}
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
              {!offline ? (
                <Action
                  label={`Ver entrenamiento del ${day(workout.date)}`}
                  quiet
                  onPress={() =>
                    router.push({ pathname: "/result/[id]", params: { id: workout.id } })
                  }
                />
              ) : null}
            </View>
          ))}
          {moreError?.base === detail ? <Notice message={moreError.message} /> : null}
          {cursor && offline ? (
            <Text style={[s.caption, { color: p.muted }]}>
              Conecta para ver más entrenamientos.
            </Text>
          ) : null}
          {cursor && !offline ? (
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
