import { ActivityIndicator, Pressable } from "react-native";
import { Icon } from "./icon";
import { usePalette } from "./ui";
export function ProgressRefresh({
  label,
  busy,
  onPress,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 48,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 24,
        backgroundColor: pressed ? p.raised : "transparent",
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={p.blue} />
      ) : (
        <Icon name="refresh" size={20} color={p.blue} />
      )}
    </Pressable>
  );
}
