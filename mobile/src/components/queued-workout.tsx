import { useCallback, useState } from "react";
import { santiagoDate } from "../../../src/domain/dates";
import { router, useFocusEffect } from "expo-router";
import { Text, View } from "react-native";
import { useWorkoutSyncQueue } from "../lib/sync-context";
import { useTraining } from "../lib/training-context";
import { useSession } from "../lib/session";
import { formatClock } from "../../../src/domain/rest-timer";
import { Action, Brand, Notice, Page, ScreenIntro, day, s, usePalette } from "./ui";
import { SyncQueueIssue } from "./sync-queue-card";
export function QueuedWorkout({ id }: { id: string }) {
  return <QueuedEntry key={id} id={id} />;
}
function QueuedEntry({ id }: { id: string }) {
  const p = usePalette(),
    { queue, syncing, transferring, synchronize, discard } = useWorkoutSyncQueue(),
    { training, controller } = useTraining(),
    { state } = useSession(),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState<string | null>(null);
  const entry = queue.entries.find((e) => e.payload.id === id),
    online = state.status === "authenticated" && state.mode === "online";
  useFocusEffect(
    useCallback(() => {
      if (entry?.phase === "confirmed" && queue.verified && online)
        router.replace({ pathname: "/result/[id]", params: { id } });
    }, [entry?.phase, queue.verified, online, id]),
  );
  if (!queue.ready || (!entry && (training.busy || training.closing)))
    return (
      <Page>
        <Notice message="Recuperando el envío de tu entrenamiento…" />
      </Page>
    );
  if (!entry)
    return (
      <Page>
        <Brand />
        <SyncQueueIssue />
        <Notice
          message={
            training.error ??
            "No encontramos ese registro en este dispositivo. Puedes consultar el historial confirmado."
          }
        />
        {training.blocked ? (
          <Action
            label="Reintentar recuperación"
            onPress={() => {
              void controller.restore();
            }}
          />
        ) : null}
        <Action label="Volver a Inicio" onPress={() => router.navigate("/")} />
        <Action label="Ver mi historial" secondary onPress={() => router.navigate("/history")} />
      </Page>
    );
  const confirmed = entry.phase === "confirmed" && queue.verified;
  return (
    <Page>
      <Brand />
      <ScreenIntro
        eyebrow={confirmed ? "CONFIRMADO POR EL SERVIDOR" : "GUARDADO LOCAL · PENDIENTE DE ENVIAR"}
        title={entry.title}
        description={`${day(santiagoDate(new Date(entry.payload.startedAt)))} · ${entry.payload.sets.length} ${entry.payload.sets.length === 1 ? "serie" : "series"} · ${formatClock(entry.payload.durationSeconds)}`}
      />
      <SyncQueueIssue />
      {error ? <Notice message={error} /> : null}
      <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
        <Text style={[s.subheading, { color: p.ink }]}>
          {confirmed
            ? "Entrenamiento confirmado"
            : queue.verified
              ? "Tu registro está protegido"
              : "Guardado de la cola sin confirmar"}
        </Text>
        <Text style={[s.body, { color: p.muted }]}>
          {confirmed
            ? "El servidor confirmó este entrenamiento. Tu coach puede revisarlo."
            : queue.verified
              ? "Conservamos el mismo identificador y contenido. Se enviará al conectar mientras la app esté abierta."
              : "Comprueba el almacenamiento antes de enviar. Conservamos el cierre y no afirmamos que la cola esté verificada."}
        </Text>
        {entry.payload.perceivedEffort != null ? (
          <Text style={[s.body, { color: p.ink }]}>
            Esfuerzo: {entry.payload.perceivedEffort}/10
          </Text>
        ) : null}
        {entry.payload.note ? (
          <Text style={[s.body, { color: p.ink }]}>{entry.payload.note}</Text>
        ) : null}
        {entry.error ? (
          <Notice
            message={
              entry.error.message +
              (entry.error.blocked
                ? " Reintento automático detenido; revisa la causa antes de volver a enviar."
                : "")
            }
          />
        ) : null}
        {!confirmed ? (
          <Action
            label="Reintentar envío"
            busy={syncing}
            disabled={!online || syncing || transferring || queue.busy || !queue.verified}
            onPress={() => {
              void synchronize().catch((e) => setError(e.message));
            }}
          />
        ) : (
          <Action
            label="Ver resultado"
            disabled={!online}
            onPress={() => router.replace({ pathname: "/result/[id]", params: { id } })}
          />
        )}
      </View>
      <Action label="Volver a Inicio" onPress={() => router.navigate("/")} />
      {!confirmed ? (
        confirm ? (
          <>
            <Notice message="Se descarta solo este registro local. Si ya se envió al servidor, seguirá en tu historial." />
            <Action
              label="Confirmar descarte"
              secondary
              disabled={syncing || transferring || queue.busy}
              onPress={() => {
                void discard(id)
                  .then(() => router.navigate("/"))
                  .catch((e) => setError(e.message));
              }}
            />
            <Action label="Conservar registro" quiet onPress={() => setConfirm(false)} />
          </>
        ) : (
          <Action
            label="Descartar registro local"
            quiet
            disabled={syncing || transferring || queue.busy}
            onPress={() => setConfirm(true)}
          />
        )
      ) : null}
    </Page>
  );
}
