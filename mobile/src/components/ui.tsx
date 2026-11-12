import { ConnectionStatus } from "./connection-status";
import { useState, type PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette } from "../lib/appearance-context";
import { Icon, type IconName } from "./icon";
import { fonts } from "../ui/tokens";
export { usePalette } from "../lib/appearance-context";
export type { Palette } from "../lib/appearance";
export const s = StyleSheet.create({
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  heading: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  subheading: {
    fontFamily: fonts.displayMedium,
    fontSize: 22,
    lineHeight: 24,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  card: { borderRadius: 12, padding: 16, borderWidth: 0, gap: 12 },
  number: { fontVariant: ["tabular-nums"], fontFamily: fonts.bodySemi },
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
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  buttonText: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 22 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22,
  },
  label: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21 },
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
  danger = false,
  busy = false,
  icon,
  iconPosition = "start",
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  quiet?: boolean;
  danger?: boolean;
  busy?: boolean;
  icon?: IconName;
  iconPosition?: "start" | "end";
}) {
  const p = usePalette();
  // Un enlace «Volver…» se muestra como flecha + texto a la izquierda, como una cabecera nativa.
  const back = quiet && !danger && (accessibilityLabel ?? label).startsWith("Volver");
  const fg = danger ? p.danger : back ? p.ink : quiet ? p.blue : secondary ? p.ink : p.onButton;
  const bg = (pressed: boolean) =>
    danger || back || quiet
      ? pressed
        ? p.raised
        : "transparent"
      : secondary
        ? p.raised
        : p.button;
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
          backgroundColor: bg(pressed),
          borderColor: danger ? p.danger : quiet || secondary || back ? "transparent" : p.button,
          opacity: disabled ? 0.5 : pressed ? 0.86 : 1,
          flexDirection: "row",
          gap: back ? 4 : 9,
        },
        back ? { alignSelf: "flex-start", paddingHorizontal: 4, minHeight: 44 } : null,
        quiet && !back ? { paddingHorizontal: 6 } : null,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          size="small"
          color={secondary || quiet || danger ? p.blue : p.onButton}
        />
      ) : back ? (
        <Icon name="chevronLeft" size={20} color={fg} />
      ) : icon && iconPosition === "start" ? (
        <Icon name={icon} size={19} color={fg} />
      ) : null}
      <Text
        style={[s.buttonText, { color: fg, textAlign: back ? "left" : "center", flexShrink: 1 }]}
      >
        {label}
      </Text>
      {!busy && !back && icon && iconPosition === "end" ? (
        <Icon name={icon} size={19} color={fg} />
      ) : null}
    </Pressable>
  );
}
export function Input({
  style,
  placeholderTextColor,
  selectionColor,
  keyboardAppearance,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & { accessibilityLabel: string }) {
  const p = usePalette();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      placeholderTextColor={placeholderTextColor ?? p.muted}
      selectionColor={selectionColor ?? p.blue}
      keyboardAppearance={keyboardAppearance ?? (p.dark ? "dark" : "light")}
      underlineColorAndroid="transparent"
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        s.input,
        { color: p.ink, backgroundColor: p.field, borderColor: p.control },
        style,
        focused ? { borderColor: p.blue } : null,
      ]}
    />
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
        height: 32,
        width: 32,
        borderRadius: 8,
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
  busy = false,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
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
      {busy ? <ActivityIndicator color={p.blue} /> : <Icon name={icon} color={p.ink} size={22} />}
    </Pressable>
  );
}
