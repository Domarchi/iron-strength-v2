import { Text } from "react-native";
import type { ExerciseChangeReview } from "../lib/training-structure";
import { Action, Notice, Page, ScreenIntro, s, usePalette } from "./ui";
export function TrainingChangeReview({
  review,
  action,
  newName,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  review: ExerciseChangeReview;
  action: "remove" | "replace";
  newName?: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const p = usePalette();
  return (
    <Page compact>
      <ScreenIntro title={action === "remove" ? "Quitar ejercicio" : "Reemplazar ejercicio"} />
      <Text style={[s.subheading, { color: p.ink }]}>{review.name}</Text>
      {newName ? <Text style={[s.body, { color: p.muted }]}>Por {newName}</Text> : null}
      <Text style={[s.body, { color: p.ink }]}>
        {review.completedSets === 1
          ? "Se perderá 1 serie registrada."
          : `Se perderán ${review.completedSets} series registradas.`}
      </Text>
      {error ? <Notice message={error} /> : null}
      <Action
        label={action === "remove" ? "Confirmar eliminación" : "Confirmar reemplazo"}
        busy={busy}
        disabled={busy}
        onPress={onConfirm}
      />
      <Action label="Cancelar cambio" quiet disabled={busy} onPress={onCancel} />
    </Page>
  );
}
