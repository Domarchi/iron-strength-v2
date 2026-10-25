import { router } from "expo-router";
import { Text, View } from "react-native";
import { useWeekDownload } from "../lib/week-context";
import { useSession } from "../lib/session";
import { downloadedAt, downloadedHistory } from "../lib/offline-week";
import { Action, day, s, usePalette } from "./ui";
export function DownloadedHistory({ exerciseId }: { exerciseId: string }) {
  const p = usePalette(),
    { state } = useSession(),
    { download } = useWeekDownload();
  if (state.status !== "authenticated") return null;
  const pack = download.verified ? download.pack : null,
    history = downloadedHistory(pack, state.session.profile.id, exerciseId);
  if (!history || !pack)
    return (
      <Text style={[s.caption, { color: p.muted }]}>
        Descarga tu semana con conexión para traer el historial reciente.
      </Text>
    );
  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
        Historial descargado
      </Text>
      <Text style={[s.caption, { color: p.muted }]}>
        Hasta 10 sesiones al {downloadedAt(pack.downloadedAt)}. Es una referencia de tu copia local.
      </Text>
      {!history.items.length ? (
        <Text style={[s.body, { color: p.muted }]}>
          No hay ejecuciones en el historial descargado de este ejercicio.
        </Text>
      ) : null}
      {history.items.map((item) => (
        <View key={item.id} style={[s.divider, { borderColor: p.border }]}>
          <Text style={[s.label, { color: p.ink }]}>
            {day(item.date)}
            {item.sessionLabel ? ` · Sesión ${item.sessionLabel}` : ""}
          </Text>
          {item.sets.map((set) => (
            <Text key={set.id} style={[s.body, s.number, { color: p.muted }]}>
              {set.isWarmup ? "Calentamiento · " : ""}
              {set.weightKg.toLocaleString("es-CL")} kg × {set.reps} reps
            </Text>
          ))}
          {state.mode === "online" ? (
            <Action
              label={`Ver entrenamiento del ${day(item.date)}`}
              quiet
              onPress={() => router.push({ pathname: "/result/[id]", params: { id: item.id } })}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}
