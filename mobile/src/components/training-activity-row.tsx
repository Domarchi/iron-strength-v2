import { memo } from "react";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import type { TrainingActivity } from "../../../src/domain/training-progress";
import { workoutTitle } from "../../../src/domain/workout-title";
import { formatWeight, formatDistance } from "../../../src/domain/training-tools";
import { useTrainingPreferences } from "../lib/training-preferences-context";
import { Icon } from "./icon";
import { day, s, usePalette } from "./ui";
export const TrainingActivityRow = memo(function TrainingActivityRow({
  row,
  from = "history",
}: {
  row: TrainingActivity;
  from?: "history" | "summary";
}) {
  const p = usePalette(),
    { preferences } = useTrainingPreferences(),
    t = row.totals;
  const values = [
    t.externalVolumeKg > 0
      ? `${formatWeight(t.externalVolumeKg, preferences.value.weightUnit)} de volumen`
      : null,
    t.durationSeconds > 0 ? `${t.durationSeconds} s registrados` : null,
    t.distanceMeters > 0 ? formatDistance(t.distanceMeters, preferences.value.distanceUnit) : null,
  ].filter(Boolean);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver entrenamiento del ${day(row.date)} · ${workoutTitle(row)}`}
      onPress={() => router.push({ pathname: "/result/[id]", params: { id: row.id, from } })}
      style={({ pressed }) => [
        s.divider,
        {
          borderColor: p.border,
          paddingBottom: 16,
          backgroundColor: pressed ? p.raised : "transparent",
          gap: 6,
        },
      ]}
    >
      <View style={s.row}>
        <Text style={[s.caption, { color: p.muted }]}>
          {day(row.date)} · {row.date.slice(0, 4)}
        </Text>
        <Text style={[s.caption, { color: p.muted }]}>
          {Math.round(row.durationSeconds / 60)} min
        </Text>
      </View>
      <View style={[s.row, { flexWrap: "nowrap" }]}>
        <Text style={[s.subheading, { color: p.ink, flex: 1 }]}>{workoutTitle(row)}</Text>
        <Icon name="arrow" size={18} color={p.muted} />
      </View>
      <Text style={[s.caption, { color: p.muted }]}>
        {row.exercises.length} {row.exercises.length === 1 ? "ejercicio" : "ejercicios"} ·{" "}
        {t.workingSets} {t.workingSets === 1 ? "serie" : "series"}
      </Text>
      {values.length ? (
        <Text style={[s.caption, { color: p.muted }]}>{values.join(" · ")}</Text>
      ) : null}
      {row.note ? (
        <Text numberOfLines={2} style={[s.caption, { color: p.muted }]}>
          {row.note}
        </Text>
      ) : null}
    </Pressable>
  );
});
