import { Pressable, Text, View } from "react-native";
import { fonts } from "../ui/tokens";
import { usePalette } from "./ui";
export { adjustWeightText } from "../lib/weight-adjust";

/**
 * Ajuste rápido del peso de la serie en curso: evita abrir el teclado para cambios de ±2,5.
 * Cada botón mide 44 px o más y conserva un nombre accesible con el número de serie.
 */
export function QuickAdjust({
  setNumber,
  step,
  unitLabel,
  disabled,
  onAdjust,
  onCopyPrevious,
}: {
  setNumber: number;
  step: number;
  unitLabel: string;
  disabled: boolean;
  onAdjust: (delta: number) => void;
  onCopyPrevious?: () => void;
}) {
  const p = usePalette();
  const fmt = (n: number) => String(n).replace(".", ",");
  const chip = (label: string, accessibilityLabel: string, onPress: () => void) => (
    <Pressable
      key={accessibilityLabel}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        minWidth: 64,
        paddingHorizontal: 12,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? p.control : p.raised,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: p.ink }}>{label}</Text>
    </Pressable>
  );
  return (
    <View
      style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingLeft: 48, paddingTop: 4 }}
    >
      {chip(`−${fmt(step)}`, `Bajar ${fmt(step)} ${unitLabel} serie ${setNumber}`, () =>
        onAdjust(-step),
      )}
      {chip(`+${fmt(step)}`, `Subir ${fmt(step)} ${unitLabel} serie ${setNumber}`, () =>
        onAdjust(step),
      )}
      {onCopyPrevious
        ? chip("Igual que antes", `Copiar anterior a serie ${setNumber}`, onCopyPrevious)
        : null}
    </View>
  );
}
