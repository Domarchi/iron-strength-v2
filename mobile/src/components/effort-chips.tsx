import { Pressable, Text, View } from "react-native";
import { fonts } from "../ui/tokens";
import { usePalette } from "./ui";

/** Atajo táctil para el esfuerzo percibido 1–10; el campo numérico sigue disponible para medios puntos. */
export function EffortChips({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const p = usePalette();
  const selected = value.trim().replace(",", ".");
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Esfuerzo del 1 al 10"
      style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
    >
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        const on = selected === String(n);
        return (
          <Pressable
            key={n}
            role="radio"
            aria-checked={on}
            aria-label={`Esfuerzo ${n}`}
            accessibilityLabel={`Esfuerzo ${n}`}
            disabled={disabled}
            onPress={() => onChange(on ? "" : String(n))}
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? p.button : p.raised,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text
              style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: on ? p.onButton : p.ink }}
            >
              {n}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
