import { trainingTitle } from "../lib/training";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { Action, Notice, s, usePalette } from "./ui";
import { useTraining } from "../lib/training-context";
import { SyncQueueCard } from "./sync-queue-card";
export function TrainingCard() {
  return (
    <>
      <ActiveTrainingCard />
      <SyncQueueCard />
    </>
  );
}
function ActiveTrainingCard() {
  const { training, controller } = useTraining(),
    p = usePalette(),
    a = training.active;
  if (!a)
    return training.error ? (
      <Notice
        message={training.error}
        retry={() => {
          if (training.blocked) void controller.restore();
          else void controller.retryStorage().catch(() => {});
        }}
      />
    ) : null;
  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: p.card,
          borderColor: p.border,
          padding: 20,
        },
      ]}
    >
      <Text style={[s.caption, { color: p.blue }]}>
        {a.mode === "demo" ? "DEMO · " : ""}
        {a.draft.status === "pending_save"
          ? "PENDIENTE DE ENVIAR"
          : a.pause?.pausedAtMs != null
            ? "ENTRENAMIENTO EN PAUSA"
            : "EN CURSO"}
      </Text>
      <Text style={[s.heading, { color: p.ink }]}>{trainingTitle(a)}</Text>
      <Text style={[s.caption, { color: p.muted }]}>
        {a.draft.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0)} series
        registradas ·{" "}
        {training.blocked
          ? "Guardado local sin verificar"
          : training.dirty
            ? "Cambios pendientes"
            : "Guardado en este dispositivo"}
      </Text>
      {training.error ? <Notice message={training.error} /> : null}
      <Action
        icon="arrow"
        iconPosition="end"
        label={a.draft.status === "pending_save" ? "Revisar envío" : "Retomar"}
        accessibilityLabel={
          a.draft.status === "pending_save" ? "Revisar envío" : "Retomar entrenamiento"
        }
        onPress={() =>
          router.push({ pathname: "/workout/[id]", params: { id: a.draft.workoutId } })
        }
      />
    </View>
  );
}
