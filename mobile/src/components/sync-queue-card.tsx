import { useState } from "react";
import { santiagoDate } from "../../../src/domain/dates";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { useWorkoutSyncQueue } from "../lib/sync-context";
import { useTraining } from "../lib/training-context";
import { useSession } from "../lib/session";
import { Action, Notice, day, s, usePalette } from "./ui";
export function SyncQueueIssue() {
  const { queue, error, recover, syncing, transferring } = useWorkoutSyncQueue(),
    [localError, setLocalError] = useState<string | null>(null);
  const message = localError ?? error ?? queue.error;
  if (!message && !queue.blocked) return null;
  return (
    <View style={{ gap: 8 }}>
      <Notice message={message ?? "Comprueba la cola local. Conservamos los datos guardados."} />
      <Action
        label="Comprobar cola local"
        secondary
        disabled={queue.busy || syncing || transferring}
        onPress={() => {
          setLocalError(null);
          void recover().catch((e) =>
            setLocalError(e instanceof Error ? e.message : "No pudimos comprobar los registros."),
          );
        }}
      />
    </View>
  );
}
export function SyncQueueCard() {
  const p = usePalette(),
    { queue, syncing, transferring, error, synchronize } = useWorkoutSyncQueue(),
    { training } = useTraining(),
    { state } = useSession();
  const [localError, setLocalError] = useState<string | null>(null);
  if (!queue.ready)
    return (
      <Text style={[s.caption, { color: p.muted }]}>
        Recuperando los envíos de este dispositivo…
      </Text>
    );
  const entries = queue.verified
      ? queue.entries.filter(
          (e) => e.phase === "pending" && e.payload.id !== training.active?.draft.workoutId,
        )
      : [],
    last = queue.verified
      ? queue.entries
          .filter(
            (e) => e.phase === "confirmed" && e.payload.id !== training.active?.draft.workoutId,
          )
          .reverse()
          .sort((a, b) => b.confirmedAt!.localeCompare(a.confirmedAt!))[0]
      : undefined;
  const sourcePending =
    training.active?.mode === "real" && training.active.draft.status === "pending_save";
  if (!entries.length && !last && !queue.blocked && !(sourcePending && error)) return null;
  const online = state.status === "authenticated" && state.mode === "online";
  return (
    <View style={[s.divider, { borderColor: p.border }]}>
      <SyncQueueIssue />
      {localError ? <Notice message={localError} /> : null}
      {entries.length ? (
        <>
          <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
            {entries.length} {entries.length === 1 ? "registro pendiente" : "registros pendientes"}
          </Text>
          <Text style={[s.body, { color: p.muted }]}>
            Se enviarán al conectar, con la app abierta.
          </Text>
          {entries.map((entry, i) => (
            <View key={entry.payload.id} style={{ gap: 6 }}>
              <Text style={[s.label, { color: p.ink }]}>
                {entry.title} · {day(santiagoDate(new Date(entry.payload.startedAt)))}
              </Text>
              {entry.error ? (
                <Text style={[s.body, { color: p.danger }]}>
                  {entry.error.message}
                  {entry.error.blocked ? " Reintento automático detenido." : ""}
                </Text>
              ) : null}
              <Action
                label="Revisar envío"
                accessibilityLabel={`Revisar envío ${i + 1}: ${entry.title}`}
                secondary
                onPress={() =>
                  router.push({ pathname: "/workout/[id]", params: { id: entry.payload.id } })
                }
              />
            </View>
          ))}
          {online ? (
            <Action
              label="Sincronizar ahora"
              disabled={!online || syncing || transferring || queue.busy}
              busy={syncing}
              onPress={() => {
                void synchronize().catch((e) => setLocalError(e.message));
              }}
            />
          ) : null}
        </>
      ) : null}
      {last ? (
        <View style={{ gap: 6 }}>
          <Text style={[s.caption, { color: p.blue }]}>ÚLTIMO ENVÍO CONFIRMADO</Text>
          <Text style={[s.label, { color: p.ink }]}>
            {last.title} · {day(santiagoDate(new Date(last.payload.startedAt)))}
          </Text>
          <Action
            label="Ver resultado del último envío"
            secondary
            disabled={!online}
            onPress={() =>
              router.push({ pathname: "/result/[id]", params: { id: last.payload.id } })
            }
          />
        </View>
      ) : null}
    </View>
  );
}
