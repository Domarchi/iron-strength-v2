import { Pressable, Text } from "react-native";
import { s, usePalette } from "./ui";
export function ProgressChoice({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      aria-pressed={selected}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        minWidth: 44,
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderBottomWidth: selected ? 2 : 0,
        borderColor: p.blue,
        justifyContent: "center",
        backgroundColor: pressed ? p.raised : "transparent",
      })}
    >
      <Text style={[s.label, { color: selected ? p.blue : p.muted, flexShrink: 1 }]}>{label}</Text>
    </Pressable>
  );
}
