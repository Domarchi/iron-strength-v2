import { ActivityIndicator, Pressable, View } from "react-native";
import { Icon, type IconName } from "../components/icon";
import { fonts, radius, touch } from "./tokens";
import { useTheme } from "./theme";
import { Txt } from "./text";

export type ButtonRole = "primary" | "secondary" | "outline" | "ghost" | "danger";
/** Cuatro roles de acción: primario, secundario, enlace (ghost) y peligro; «outline» para alternativas. */
export function Button({
  label,
  accessibilityLabel,
  onPress,
  role = "primary",
  size = "md",
  icon,
  iconEnd,
  busy = false,
  disabled = false,
  full = true,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  role?: ButtonRole;
  size?: "md" | "sm";
  icon?: IconName;
  iconEnd?: boolean;
  busy?: boolean;
  disabled?: boolean;
  full?: boolean;
}) {
  const t = useTheme();
  const palette = {
    primary: { bg: t.accent, fg: t.onAccent, border: t.accent },
    secondary: { bg: t.surface2, fg: t.text, border: t.surface2 },
    outline: { bg: "transparent", fg: t.text, border: t.line },
    ghost: { bg: "transparent", fg: t.accent, border: "transparent" },
    danger: { bg: "transparent", fg: t.danger, border: t.danger },
  }[role];
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: size === "md" ? 48 : touch,
        paddingHorizontal: size === "md" ? 18 : 14,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.bg,
        flexDirection: iconEnd ? "row-reverse" : "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        alignSelf: full ? "stretch" : "flex-start",
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        transform: [{ scale: pressed && !off ? 0.985 : 1 }],
      })}
    >
      {busy ? (
        <ActivityIndicator
          size="small"
          color={palette.fg}
          aria-label="Cargando"
          accessibilityLabel="Cargando"
        />
      ) : icon ? (
        <Icon name={icon} size={size === "md" ? 19 : 17} color={palette.fg} />
      ) : null}
      <Txt
        style={{ fontFamily: fonts.bodyBold, textAlign: "center", flexShrink: 1 }}
        color={palette.fg}
        size={size === "md" ? 15 : 14}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  tone = "text",
  filled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "text" | "accent" | "danger";
  filled?: boolean;
}) {
  const t = useTheme();
  const color = tone === "accent" ? t.accent : tone === "danger" ? t.danger : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: filled || pressed ? t.surface2 : "transparent",
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <View>
        <Icon name={icon} size={22} color={color} />
      </View>
    </Pressable>
  );
}
