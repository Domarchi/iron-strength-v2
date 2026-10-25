import { router } from "expo-router";
import { Text, View } from "react-native";
import { Action, Notice, s, usePalette } from "./ui";
import { useTraining } from "../lib/training-context";
export function TrainingCard() {
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
          borderTopWidth: 2,
          borderTopColor: p.blue,
        },
      ]}
    >
      <Text style={[s.caption, { color: p.blue }]}>
        {a.mode === "demo" ? "DEMO · " : ""}
        {a.draft.status === "pending_save" ? "PENDIENTE DE ENVIAR" : "ENTRENAMIENTO EN CURSO"}
      </Text>
      <Text style={[s.heading, { color: p.ink, fontSize: 28, lineHeight: 34 }]}>
        {a.routine.session.title ?? `Sesión ${a.routine.session.label}`}
      </Text>
      <Text style={[s.body, { color: p.muted }]}>
        {a.draft.exercises.flatMap((e) => e.sets).filter((x) => x.done).length} series registradas ·{" "}
        {training.dirty ? "Cambios pendientes" : "Guardado en este dispositivo"}
      </Text>
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
