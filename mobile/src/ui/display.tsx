import { useEffect, type ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { Icon } from "../components/icon";
import { useReducedMotion } from "../lib/motion-context";
import { Button } from "./actions";
import { fonts, radius } from "./tokens";
import { useTheme } from "./theme";
import { Txt } from "./text";

export type Tone = "neutral" | "accent" | "ok" | "rec" | "danger";
function toneColors(t: ReturnType<typeof useTheme>, tone: Tone) {
  return {
    neutral: { bg: t.surface2, fg: t.muted },
    accent: { bg: t.accentSoft, fg: t.accent },
    ok: { bg: t.okBg, fg: t.ok },
    rec: { bg: t.recBg, fg: t.rec },
    danger: { bg: t.dangerBg, fg: t.danger },
  }[tone];
}

/** Etiqueta informativa, no interactiva. */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const t = useTheme();
  const c = toneColors(t, tone);
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radius.sm,
        backgroundColor: c.bg,
      }}
    >
      <Txt style={{ fontFamily: fonts.bodySemi }} size={12} color={c.fg}>
        {label}
      </Txt>
    </View>
  );
}

/** Filtro o selección. Con `onPress` es un botón con objetivo táctil de 44 px. */
export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const t = useTheme();
  const body = (
    <View
      style={{
        minHeight: 34,
        alignSelf: "flex-start",
        paddingHorizontal: 14,
        justifyContent: "center",
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? t.accent : "transparent",
        backgroundColor: selected ? t.accentSoft : t.surface2,
      }}
    >
      <Txt style={{ fontFamily: fonts.bodySemi }} size={13} color={selected ? t.accent : t.muted}>
        {label}
      </Txt>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ minHeight: 44, justifyContent: "center" }}
    >
      {body}
    </Pressable>
  );
}

export function Avatar({
  name,
  size = 40,
  tone = "neutral",
}: {
  name: string;
  size?: number;
  tone?: "neutral" | "accent";
}) {
  const t = useTheme();
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <View
      accessible
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tone === "accent" ? t.accent : t.surface2,
      }}
    >
      <Txt variant="heading" size={size * 0.45} color={tone === "accent" ? t.onAccent : t.text}>
        {initial}
      </Txt>
    </View>
  );
}

export function Card({
  children,
  onPress,
  accessibilityLabel,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.surface,
    borderColor: t.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 16,
    gap: 10,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [base, style, { opacity: pressed ? 0.88 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  chevron = false,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const content = (
    <View
      style={{
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 8,
      }}
    >
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={{ fontFamily: fonts.bodySemi }}>{title}</Txt>
        {subtitle ? (
          <Txt variant="caption" muted>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {trailing}
      {chevron ? (
        <View style={{ transform: [{ rotate: "180deg" }] }}>
          <Icon name="chevronLeft" size={18} color={t.muted} />
        </View>
      ) : null}
    </View>
  );
  if (!onPress)
    return accessibilityLabel ? (
      <View accessible accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    ) : (
      content
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}. ${subtitle}` : title)}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      {content}
    </Pressable>
  );
}

/** Cifra protagonista con unidad y etiqueta. */
export function Stat({
  value,
  unit,
  label,
  tone,
}: {
  value: string;
  unit?: string;
  label: string;
  tone?: "rec" | "ok";
}) {
  const t = useTheme();
  const color = tone === "rec" ? t.rec : tone === "ok" ? t.ok : t.text;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ""}`}
      style={{ gap: 2 }}
    >
      <Txt variant="label" muted>
        {label}
      </Txt>
      <Txt variant="number" color={color}>
        {value}
        {unit ? (
          <Txt variant="caption" muted>
            {" "}
            {unit}
          </Txt>
        ) : null}
      </Txt>
    </View>
  );
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Txt variant="label" muted accessibilityRole="header">
        {title}
      </Txt>
      {action ? (
        <Button label={action.label} onPress={action.onPress} role="ghost" size="sm" full={false} />
      ) : null}
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.line }} />;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 28, paddingHorizontal: 12 }}>
      <Txt variant="heading" align="center">
        {title}
      </Txt>
      <Txt muted align="center">
        {body}
      </Txt>
      {action ? (
        <View style={{ alignSelf: "center" }}>
          <Button label={action.label} onPress={action.onPress} full={false} />
        </View>
      ) : null}
    </View>
  );
}

/** Marcador de carga. Con «Reducir movimiento» queda fijo. */
export function Skeleton({
  width = "100%",
  height = 16,
}: {
  width?: number | `${number}%`;
  height?: number;
}) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduced) {
      o.value = 1;
      return;
    }
    o.value = withRepeat(withTiming(0.45, { duration: 800 }), -1, true);
  }, [reduced, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius.sm, backgroundColor: t.surface2 }, style]}
    />
  );
}

/** Anillo de avance 0–1 con texto accesible. */
export function ProgressRing({
  value,
  size = 48,
  stroke = 5,
  label,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  children?: ReactNode;
}) {
  const t = useTheme();
  const v = Math.min(1, Math.max(0, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View
      accessible
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      accessibilityLabel={label}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={t.surface2}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={t.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}
