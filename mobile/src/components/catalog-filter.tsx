import { Pressable, Text, View } from "react-native";
import { s, usePalette } from "./ui";

export function CatalogFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: "Músculo" | "Equipo";
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {[{ value: "", label: "Todos" }, ...options].map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${option.label}`}
          aria-pressed={value === option.value}
          onPress={() => onChange(option.value)}
          style={({ pressed }) => ({
            minHeight: 48,
            minWidth: 48,
            justifyContent: "center",
            paddingHorizontal: 12,
            paddingVertical: 12,
            borderRadius: 8,
            maxWidth: "100%",
            backgroundColor: value === option.value ? p.button : pressed ? p.card : p.raised,
          })}
        >
          <Text style={[s.caption, { color: value === option.value ? "#fff" : p.ink }]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
