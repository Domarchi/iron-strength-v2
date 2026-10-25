import { ConnectionStatus } from "./connection-status";
import type { PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette } from "../lib/appearance-context";
import { Icon, type IconName } from "./icon";
export { usePalette } from "../lib/appearance-context";
export type { Palette } from "../lib/appearance";
export const s = StyleSheet.create({
  body: { fontSize: 16, lineHeight: 24 },
  caption: { fontSize: 13, lineHeight: 19, fontWeight: "500", letterSpacing: 0.2 },
  heading: { fontSize: 34, lineHeight: 40, fontWeight: "700", letterSpacing: -1.1 },
  subheading: { fontSize: 20, lineHeight: 27, fontWeight: "700", letterSpacing: -0.4 },
  card: { borderRadius: 18, padding: 18, borderWidth: 1, gap: 12 },
  number: { fontVariant: ["tabular-nums"], fontWeight: "600" },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 18, gap: 12 },
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
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  buttonText: { fontSize: 16, lineHeight: 24, fontWeight: "600" },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
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
  quiet = false,
  busy = false,
  icon,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  quiet?: boolean;
  busy?: boolean;
  icon?: IconName;
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
          backgroundColor: quiet
            ? pressed
              ? p.raised
              : "transparent"
            : secondary
              ? pressed
                ? p.raised
                : p.card
              : p.button,
          borderColor: quiet ? "transparent" : secondary ? p.border : p.button,
          opacity: disabled ? 0.5 : pressed ? 0.86 : 1,
          flexDirection: "row",
          gap: 9,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary || quiet ? p.blue : "#fff"} />
      ) : (
        <>
          {icon ? (
            <Icon name={icon} size={19} color={quiet ? p.blue : secondary ? p.ink : "#fff"} />
          ) : null}
          <Text
            style={[
              s.buttonText,
              {
                color: quiet ? p.blue : secondary ? p.ink : "#fff",
                textAlign: "center",
                flexShrink: 1,
              },
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
export function Page({ children }: PropsWithChildren) {
  const p = usePalette(),
    insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top }}>
      <ScrollView
        testID="app-page"
        style={{ flex: 1, backgroundColor: p.bg }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: insets.bottom + 28,
          gap: 20,
          flexGrow: 1,
          width: "100%",
          maxWidth: 560,
          alignSelf: "center",
        }}
        keyboardShouldPersistTaps="handled"
      >
        <ConnectionStatus />
        {children}
      </ScrollView>
    </View>
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
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          backgroundColor: p.tint,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="train" color={p.blue} size={20} />
      </View>
      <Text
        style={[s.caption, { color: p.ink, fontSize: 12, fontWeight: "800", letterSpacing: 1.2 }]}
      >
        IRON STRENGTH
      </Text>
    </View>
  );
}
export function day(value: string) {
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : value;
}

export function ScreenIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: 7 }}>
      <Text style={[s.caption, { color: p.muted, letterSpacing: 1.3 }]}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={[s.heading, { color: p.ink }]}>
        {title}
      </Text>
      {description ? <Text style={[s.body, { color: p.muted }]}>{description}</Text> : null}
    </View>
  );
}
export function Metric({ value, label }: { value: string; label: string }) {
  const p = usePalette();
  return (
    <View style={{ gap: 3, flex: 1, minWidth: 70 }}>
      <Text
        style={{
          color: p.ink,
          fontSize: 28,
          lineHeight: 34,
          fontWeight: "700",
          letterSpacing: -0.8,
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      <Text style={[s.caption, { color: p.muted }]}>{label}</Text>
    </View>
  );
}
export function SessionMark({ label }: { label: string }) {
  const p = usePalette();
  return (
    <View
      style={{
        height: 46,
        width: 46,
        borderRadius: 13,
        borderWidth: 1,
        borderColor: p.border,
        backgroundColor: p.raised,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: p.ink, fontSize: 22, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

export function IconAction({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 48,
        minHeight: 48,
        borderRadius: 24,
        backgroundColor: pressed ? p.raised : "transparent",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Icon name={icon} color={p.ink} size={22} />
    </Pressable>
  );
}
