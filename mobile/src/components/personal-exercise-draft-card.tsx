import { router } from "expo-router";
import { Text, View } from "react-native";
import { usePersonalExerciseDraft } from "../lib/personal-exercise-context";
import { Action, Notice, s, usePalette } from "./ui";
export function PersonalExerciseDraftCard() {
  const { controller, exercises } = usePersonalExerciseDraft(),
    p = usePalette();
  if (!exercises.draft?.changed && !exercises.pending && !exercises.error) return null;
  return (
    <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
      <Text style={[s.label, { color: p.ink }]}>
        {exercises.pending ? "Ejercicio sin confirmar" : "Cambios en tus ejercicios"}
      </Text>
      {exercises.error ? (
        <Notice
          message={exercises.error}
          retry={
            exercises.blocked
              ? () => {
                  void controller.restore();
                }
              : exercises.dirty
                ? () => {
                    void controller.retryStorage().catch(() => {});
                  }
                : undefined
          }
        />
      ) : null}
      <Text style={[s.caption, { color: p.muted }]}>
        {exercises.dirty
          ? "Cambios pendientes de guardar en este dispositivo."
          : exercises.pending
            ? "Conservamos el mismo intento para confirmar el guardado."
            : "Guardado en este dispositivo"}
      </Text>
      <Action
        label="Revisar ejercicios pendientes"
        secondary
        disabled={exercises.busy || exercises.paused}
        onPress={() => router.navigate("/my-exercises")}
      />
    </View>
  );
}
