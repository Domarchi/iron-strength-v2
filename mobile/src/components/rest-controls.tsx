import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Action, IconAction, s, usePalette } from "./ui";
import { formatClock } from "../../../src/domain/rest-timer";

/** A layout sibling of the scroll view: visible without covering a set or the keyboard. */
export function RestControls({
  seconds,
  onAdjust,
  onSkip,
}: {
  seconds: number;
  onAdjust: (delta: number) => void;
  onSkip: () => void;
}) {
  const p = usePalette(),
    insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: p.card,
        borderTopWidth: 1,
        borderTopColor: p.border,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: Math.max(insets.bottom, 10),
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 520,
          alignSelf: "center",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={[s.caption, { color: p.muted }]}>Descanso</Text>
          <Text
            accessibilityLabel="Tiempo de descanso restante"
            style={[s.number, { fontSize: 26, lineHeight: 32, color: p.blue }]}
          >
            {formatClock(seconds)}
          </Text>
        </View>
        <IconAction label="Restar 15 segundos" icon="minus" onPress={() => onAdjust(-15)} />
        <IconAction label="Sumar 15 segundos" icon="plus" onPress={() => onAdjust(15)} />
        <Action label="Saltar" accessibilityLabel="Omitir descanso" quiet onPress={onSkip} />
      </View>
    </View>
  );
}
