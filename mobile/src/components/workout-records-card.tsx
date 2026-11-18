import { useCallback } from "react";
import { Text, View } from "react-native";
import { s, usePalette } from "./ui";
import { useSession } from "../lib/session";
import { useQuery } from "../lib/use-query";
import { recordLabel, recordsOfWorkout, volumeComparisons } from "../lib/workout-records";

/** Récords que mejoró este entrenamiento. Si no hay (o no cargan), no muestra nada. */
export function WorkoutRecordsCard({ workoutId }: { workoutId: string }) {
  const p = usePalette(),
    { client } = useSession(),
    request = useCallback(() => client.trainingProgress(), [client]),
    q = useQuery(request);
  const records = q.value ? recordsOfWorkout(q.value, workoutId) : [];
  const volumes = q.value ? volumeComparisons(q.value, workoutId) : [];
  if (!records.length && !volumes.length) return null;
  const kg = (n: number) => n.toLocaleString("es-CL");
  return (
    <View style={{ gap: 12 }}>
      {records.length ? (
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
      ) : null}
      {volumes.length ? (
        <View style={[s.divider, { borderColor: p.border, gap: 6 }]}>
          <Text style={[s.label, { color: p.ink }]}>Frente a la sesión anterior</Text>
          {volumes.map((v) => {
            const d = v.volumeKg - v.previousKg;
            return (
              <Text key={v.name} style={[s.body, { color: p.muted }]}>
                {v.name}: {kg(v.volumeKg)} kg de volumen (
                {d === 0 ? "igual" : `${d > 0 ? "+" : "−"}${kg(Math.abs(d))} kg`})
              </Text>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
