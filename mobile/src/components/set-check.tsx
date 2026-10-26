import { Pressable, View } from "react-native";
import { Icon } from "./icon";
import { usePalette } from "./ui";

/** Compact visible mark; the full surrounding square remains a touch target. */
export function SetCheck({
  number,
  checked,
  onPress,
}: {
  number: number;
  checked: boolean;
  onPress: () => void;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`Completar serie ${number}`}
      accessibilityState={{ checked }}
      aria-checked={checked}
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
      <View
        testID={`set-check-mark-${number}`}
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          borderWidth: checked ? 0 : 1.5,
          borderColor: p.control,
          backgroundColor: checked ? p.completedMark : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Icon name="check" color="#fff" size={16} /> : null}
      </View>
    </Pressable>
  );
}
