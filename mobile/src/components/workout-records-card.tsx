import { useCallback } from "react";
import { Text, View } from "react-native";
import { s, usePalette } from "./ui";
import { useSession } from "../lib/session";
import { useQuery } from "../lib/use-query";
import { recordLabel, recordsOfWorkout } from "../lib/workout-records";

/** Récords que mejoró este entrenamiento. Si no hay (o no cargan), no muestra nada. */
export function WorkoutRecordsCard({ workoutId }: { workoutId: string }) {
  const p = usePalette(),
    { client } = useSession(),
    request = useCallback(() => client.trainingProgress(), [client]),
    q = useQuery(request);
  const records = q.value ? recordsOfWorkout(q.value, workoutId) : [];
  if (!records.length) return null;
  return (
    <View
      accessibilityLabel={`${records.length} ${records.length === 1 ? "récord" : "récords"} en este entrenamiento`}
      style={[s.divider, { borderColor: p.border, gap: 6 }]}
    >
      <Text style={[s.label, { color: p.blue }]}>
        {records.length === 1 ? "1 récord nuevo" : `${records.length} récords nuevos`}
      </Text>
      {records.map((r) => (
        <Text key={`${r.exerciseId}:${r.metric}`} style={[s.body, { color: p.ink }]}>
          {r.name} · {recordLabel(r.metric)}: {String(r.value).replace(".", ",")} (antes{" "}
          {String(r.previous).replace(".", ",")})
        </Text>
      ))}
    </View>
  );
}
