import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useAppearance } from "../lib/appearance-context";
import { Icon, type IconName } from "./icon";
import { s, usePalette } from "./ui";
import type { AppearancePreference } from "../lib/appearance";
const options: { value: AppearancePreference; label: string; icon: IconName }[] = [
  { value: "light", label: "Claro", icon: "sun" },
  { value: "dark", label: "Oscuro", icon: "moon" },
  { value: "system", label: "Sistema", icon: "system" },
];
export function AppearanceSelect() {
  const p = usePalette(),
    a = useAppearance(),
    { fontScale } = useWindowDimensions(),
    stacked = fontScale > 1.15;
  const label =
    a.preference === "system"
      ? "Según tu teléfono"
      : a.preference === "dark"
        ? "Tema oscuro"
        : "Tema claro";
  return (
    <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
      <Text style={[s.subheading, { color: p.ink }]}>Apariencia</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Tema de la app"
        style={{ flexDirection: stacked ? "column" : "row", gap: 8 }}
      >
        {options.map((option) => {
          const selected = a.preference === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              aria-checked={selected}
              accessibilityState={{ checked: selected, disabled: !a.ready || a.busy }}
              disabled={!a.ready || a.busy}
              onPress={() => {
                void a.choose(option.value);
              }}
              style={({ pressed }) => ({
                flex: stacked ? undefined : 1,
                flexDirection: stacked ? "row" : "column",
                minHeight: stacked ? 64 : 80,
                padding: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: selected ? p.blue : p.border,
                backgroundColor: selected ? p.tint : pressed ? p.raised : p.bg,
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                opacity: !a.ready || a.busy ? 0.6 : 1,
              })}
            >
              <Icon name={option.icon} size={21} color={selected ? p.blue : p.muted} />
              <Text style={[s.label, { color: selected ? p.blue : p.ink }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text accessibilityLiveRegion="polite" style={[s.caption, { color: p.muted }]}>
        {label}
        {a.saved ? " · Guardado en este dispositivo" : ""}
      </Text>
      {a.error ? (
        <View style={{ gap: 5 }}>
          <Text accessibilityRole="alert" style={[s.body, { color: p.danger }]}>
            {a.error}
          </Text>
          <Text style={[s.caption, { color: p.muted }]}>Vuelve a elegir para reintentar.</Text>
        </View>
      ) : null}
    </View>
  );
}
