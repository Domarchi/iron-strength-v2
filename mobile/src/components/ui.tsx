import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
export function usePalette() {
  return useColorScheme() === "dark"
    ? {
        dark: true,
        bg: "#071629",
        card: "#10253e",
        ink: "#f2f6ff",
        muted: "#b6c8df",
        blue: "#78b5ff",
        button: "#005fd9",
        border: "#2a4260",
        tint: "#173c65",
        success: "#a2e5c4",
        danger: "#ffb8b8",
      }
    : {
        dark: false,
        bg: "#f3f7fd",
        card: "#ffffff",
        ink: "#142d4e",
        muted: "#52647c",
        blue: "#005fd9",
        button: "#005fd9",
        border: "#d8e2ef",
        tint: "#e6effe",
        success: "#106044",
        danger: "#a12121",
      };
}
export type Palette = ReturnType<typeof usePalette>;
export const s = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 23 },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: "600", letterSpacing: 0.4 },
  heading: { fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.7 },
  subheading: { fontSize: 19, lineHeight: 27, fontWeight: "700" },
  card: { borderRadius: 22, padding: 20, borderWidth: 1, gap: 12 },
  row: {
    flexWrap: "wrap",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  button: {
    maxWidth: "100%",
    minHeight: 52,
    borderRadius: 15,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  buttonText: { fontSize: 16, lineHeight: 24, fontWeight: "700" },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 16,
  },
  label: { fontSize: 14, lineHeight: 21, fontWeight: "600" },
  screen: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 18 },
});
export function Action({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  secondary = false,
  busy = false,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  busy?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor: secondary ? p.card : p.button,
          borderColor: secondary ? p.border : p.button,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? p.blue : "#fff"} />
      ) : (
        <Text style={[s.buttonText, { color: secondary ? p.blue : "#fff", textAlign: "center" }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
export function Page({ children }: PropsWithChildren) {
  const p = usePalette(),
    insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: p.bg }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: insets.top + 18,
        paddingBottom: insets.bottom + 28,
        gap: 20,
        flexGrow: 1,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}
export function Loading() {
  const p = usePalette();
  return (
    <View style={[s.center, { backgroundColor: p.bg }]}>
      <ActivityIndicator size="large" color={p.blue} />
      <Text style={[s.body, { color: p.muted }]}>Un momento…</Text>
    </View>
  );
}
export function Notice({ message, retry }: { message: string; retry?: () => void }) {
  const p = usePalette();
  return (
    <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
      <Text accessibilityRole="alert" style={[s.body, { color: p.ink }]}>
        {message}
      </Text>
      {retry ? <Action label="Reintentar" onPress={retry} secondary /> : null}
    </View>
  );
}
export function Brand() {
  const p = usePalette();
  return (
    <Text style={[s.caption, { color: p.blue, fontSize: 14, fontWeight: "800", letterSpacing: 2 }]}>
      IRON STRENGTH
    </Text>
  );
}
export function day(value: string) {
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : value;
}
