import { useState } from "react";
import { View } from "react-native";
import { Action, Notice } from "./ui";
/** Recovery when a failed exit leaves an empty coordinator with protected memory. */
export function EmptyChangeRecovery({
  kind,
  disabled,
  onReload,
}: {
  kind: "corrección" | "eliminación";
  disabled: boolean;
  onReload: () => Promise<unknown>;
}) {
  const [review, setReview] = useState(false),
    [error, setError] = useState<string | null>(null);
  return (
    <View style={{ gap: 10 }}>
      {error ? <Notice message={error} /> : null}
      {review ? (
        <>
          <Notice message="Se reemplazará la propuesta en memoria por la guardada en este dispositivo. Se perderán los cambios que no se pudieron guardar." />
          <Action
            label={`Volver a comprobar ${kind}`}
            disabled={disabled}
            onPress={() => {
              setError(null);
              void onReload()
                .then(() => setReview(false))
                .catch((e) =>
                  setError(
                    e instanceof Error ? e.message : "No pudimos recuperar los datos locales.",
                  ),
                );
            }}
          />
          <Action
            label="Conservar memoria"
            secondary
            disabled={disabled}
            onPress={() => setReview(false)}
          />
        </>
      ) : (
        <Action
          label={`Releer ${kind} local`}
          secondary
          disabled={disabled}
          onPress={() => setReview(true)}
        />
      )}
    </View>
  );
}
