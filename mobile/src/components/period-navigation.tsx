import { View, Text, Pressable } from "react-native";
import { Icon } from "./icon";
import { s, usePalette } from "./ui";
export function PeriodNavigation({
  label,
  onPrevious,
  onNext,
}: {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Periodo anterior"
        onPress={onPrevious}
        style={{
          minHeight: 48,
          minWidth: 48,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ rotate: "180deg" }],
        }}
      >
        <Icon name="arrow" color={p.ink} size={20} />
      </Pressable>
      <Text
        accessibilityRole="header"
        style={[s.subheading, { color: p.ink, flex: 1, textAlign: "center" }]}
      >
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Periodo siguiente"
        onPress={onNext}
        style={{ minHeight: 48, minWidth: 48, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name="arrow" color={p.ink} size={20} />
      </Pressable>
    </View>
  );
}
