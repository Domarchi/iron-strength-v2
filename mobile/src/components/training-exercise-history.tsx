import { Text, View } from "react-native";
import { router } from "expo-router";
import { useTrainingExerciseQuery } from "../lib/training-download-query";
import { useTrainingPreferences } from "../lib/training-preferences-context";
import { useTrainingDownload } from "../lib/training-download-context";
import { useSession } from "../lib/session";
import { formatPresentedTrainingMetrics } from "../../../src/domain/training-metrics";
import { SET_TYPE_LABELS } from "../lib/training-labels";
import { downloadedAt } from "../lib/offline-week";
import { DownloadedHistory } from "./downloaded-history";
import { Action, Notice, day, s, usePalette } from "./ui";
export function TrainingExerciseHistory({ exerciseId }: { exerciseId: string }) {
  const p = usePalette(),
    { state } = useSession(),
    { bundle } = useTrainingDownload(),
    { preferences } = useTrainingPreferences();
  const q = useTrainingExerciseQuery(exerciseId);
  const offline = state.status === "authenticated" && state.mode === "offline";
  if (offline && !bundle) return <DownloadedHistory exerciseId={exerciseId} personal />;
  if (q.error) return <Notice message={q.error} retry={offline ? undefined : q.retry} />;
  if (!q.value) return <Text style={[s.caption, { color: p.muted }]}>Cargando historial…</Text>;
  return (
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
        {offline ? "Historial descargado" : "Últimas sesiones"}
      </Text>
      {q.downloadedAt ? (
        <Text style={[s.caption, { color: p.muted }]}>
          {downloadedAt(q.downloadedAt)} · Hasta 10 sesiones
        </Text>
      ) : null}
      {!q.value.history.items.length ? (
        <Text style={[s.caption, { color: p.muted }]}>No hay ejecuciones en este historial.</Text>
      ) : null}
      {q.value.history.items.map((row) => (
        <View key={row.id} style={[s.divider, { borderColor: p.border }]}>
          <Text style={[s.label, { color: p.ink }]}>
            {day(row.date)}
            {"title" in row && row.title ? ` · ${row.title}` : ""}
          </Text>
          {"exerciseNotes" in row
            ? row.exerciseNotes
                .filter((n) => n.note)
                .map((n) => (
                  <Text key={n.position} style={[s.caption, { color: p.muted }]}>
                    {n.note}
                  </Text>
                ))
            : null}
          {row.sets.map((set) => (
            <Text key={set.id} style={[s.body, s.number, { color: p.ink }]}>
              {"setType" in set
                ? SET_TYPE_LABELS[set.setType]
                : set.isWarmup
                  ? "Calentamiento"
                  : "Trabajo"}{" "}
              {set.setNumber} ·{" "}
              {formatPresentedTrainingMetrics(
                "metrics" in set
                  ? set.metrics
                  : {
                      recordType: null,
                      weightKg: set.weightKg,
                      reps: set.reps,
                      durationSeconds: null,
                      distanceMeters: null,
                    },
                preferences.value,
              )}
              {"effort" in set && set.effort !== null ? ` · Esfuerzo ${set.effort}/10` : ""}
            </Text>
          ))}
        </View>
      ))}
      {q.value.history.nextCursor ? (
        offline ? (
          <Text style={[s.caption, { color: p.muted }]}>Conecta para ver más entrenamientos.</Text>
        ) : (
          <Action
            label="Ver más historial"
            quiet
            onPress={() => router.push({ pathname: "/exercises/[id]", params: { id: exerciseId } })}
          />
        )
      ) : null}
    </View>
  );
}
