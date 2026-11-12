import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { formatClock } from "../../../src/domain/rest-timer";
import { Action, IconAction, s, usePalette } from "./ui";

export function WorkoutHeading({
  title,
  elapsed,
  done,
  total,
  pause,
  onBack,
  onFinish,
  finishDisabled,
  backDisabled = false,
  paused = false,
}: {
  title: string;
  elapsed: number;
  done: number;
  total: number;
  pause: ReactNode;
  onBack: () => void;
  onFinish?: () => void;
  finishDisabled: boolean;
  backDisabled?: boolean;
  paused?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      <IconAction
        label="Volver a Inicio"
        icon="chevronLeft"
        onPress={onBack}
        disabled={backDisabled}
      />
      <View style={{ flex: 1, minWidth: 80, gap: 3 }}>
        <Text accessibilityRole="header" numberOfLines={1} style={[s.label, { color: p.ink }]}>
          {title}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Text
            accessibilityLabel="Duración del entrenamiento"
            style={[s.caption, s.number, { color: p.muted }]}
          >
            {formatClock(elapsed)}
          </Text>
          {paused ? <Text style={[s.caption, { color: p.blue }]}>En pausa</Text> : null}
          <Text style={[s.caption, s.number, { color: p.muted }]}>
            {done}/{total} series
          </Text>
        </View>
      </View>
      {pause}
      {onFinish ? (
        <Action
          label="Finalizar"
          accessibilityLabel="Finalizar entrenamiento"
          disabled={finishDisabled}
          onPress={onFinish}
        />
      ) : null}
    </View>
  );
}
