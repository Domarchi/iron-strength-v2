import { ConnectionStatus } from "./connection-status";
import type { PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette } from "../lib/appearance-context";
import { Icon, type IconName } from "./icon";
export { usePalette } from "../lib/appearance-context";
export type { Palette } from "../lib/appearance";
export const s = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 22 },
  caption: { fontSize: 13, lineHeight: 19, fontWeight: "400" },
  heading: { fontSize: 30, lineHeight: 36, fontWeight: "600", letterSpacing: -0.7 },
  subheading: { fontSize: 19, lineHeight: 25, fontWeight: "600", letterSpacing: -0.3 },
  card: { borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, gap: 10 },
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
    minHeight: 48,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  buttonText: { fontSize: 15, lineHeight: 22, fontWeight: "600" },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  label: { fontSize: 15, lineHeight: 21, fontWeight: "500" },
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
                : p.raised
              : p.button,
          borderColor: quiet || secondary ? "transparent" : p.button,
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
export function Page({ children, compact = false }: PropsWithChildren<{ compact?: boolean }>) {
  const p = usePalette(),
    insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top }}>
      <ScrollView
        testID="app-page"
        style={{ flex: 1, backgroundColor: p.bg }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: compact ? 12 : 20,
          paddingBottom: insets.bottom + 28,
          gap: compact ? 14 : 24,
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
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: 7 }}>
      {eyebrow ? <Text style={[s.caption, { color: p.muted }]}>{eyebrow}</Text> : null}
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
        height: 36,
        width: 36,
        borderRadius: 11,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: p.border,
        backgroundColor: p.raised,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: p.ink, fontSize: 17, fontWeight: "600" }}>{label}</Text>
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
