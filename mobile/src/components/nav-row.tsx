import { Pressable, Text, View } from "react-native";
import { fonts } from "../ui/tokens";
import { Icon } from "./icon";
import { usePalette } from "./ui";

/** Fila de ajustes con flecha: reemplaza los enlaces de texto centrados (hallazgos M3/M13/M15). */
export function NavRow({
  label,
  hint,
  onPress,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 8,
        borderBottomWidth: 0.5,
        borderBottomColor: p.border,
        backgroundColor: pressed ? p.raised : "transparent",
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: p.ink }}>{label}</Text>
        {hint ? (
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: p.muted }}>{hint}</Text>
        ) : null}
      </View>
      <View style={{ transform: [{ rotate: "180deg" }] }}>
        <Icon name="chevronLeft" size={18} color={p.muted} />
      </View>
    </Pressable>
  );
}
