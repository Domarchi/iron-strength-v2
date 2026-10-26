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
        },
      ]}
    >
      <Text style={[s.caption, { color: p.blue }]}>
        {a.mode === "demo" ? "DEMO · " : ""}
        {a.draft.status === "pending_save"
          ? "PENDIENTE DE ENVIAR"
          : a.pause?.pausedAtMs != null
            ? "ENTRENAMIENTO EN PAUSA"
            : "ENTRENAMIENTO EN CURSO"}
      </Text>
      <Text style={[s.heading, { color: p.ink, fontSize: 24, lineHeight: 30 }]}>
        {a.routine.session.title ?? `Sesión ${a.routine.session.label}`}
      </Text>
      <Text style={[s.body, { color: p.muted }]}>
        {a.draft.exercises.flatMap((e) => e.sets).filter((x) => x.done).length} series registradas ·{" "}
        {training.blocked
          ? "Guardado local sin verificar"
          : training.dirty
            ? "Cambios pendientes"
            : "Guardado en este dispositivo"}
      </Text>
      {training.error ? <Notice message={training.error} /> : null}
      <Action
        icon="arrow"
        label={a.draft.status === "pending_save" ? "Revisar envío" : "Retomar entrenamiento"}
        onPress={() =>
          router.push({ pathname: "/workout/[id]", params: { id: a.draft.workoutId } })
        }
      />
    </View>
  );
}
