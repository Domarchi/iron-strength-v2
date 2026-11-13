import { useEffect } from "react";
import { View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useReducedMotion } from "../lib/motion-context";
import { Button } from "./actions";
import { fonts, motion, radius } from "./tokens";
import { useTheme } from "./theme";
import { Txt } from "./text";

/** Aviso en línea. Los de error se anuncian como alerta; el resto con región educada. */
export function Banner({
  tone = "neutral",
  title,
  message,
  action,
}: {
  tone?: "neutral" | "ok" | "rec" | "danger";
  title?: string;
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  const t = useTheme();
  const c = {
    neutral: { bg: t.surface2, fg: t.text },
    ok: { bg: t.okBg, fg: t.ok },
    rec: { bg: t.recBg, fg: t.rec },
    danger: { bg: t.dangerBg, fg: t.danger },
  }[tone];
  return (
    <View
      accessibilityRole={tone === "danger" ? "alert" : undefined}
      accessibilityLiveRegion={tone === "danger" ? "assertive" : "polite"}
      style={{ backgroundColor: c.bg, borderRadius: radius.md, padding: 14, gap: 8 }}
    >
      {title ? (
        <Txt style={{ fontFamily: fonts.bodyBold }} color={c.fg}>
          {title}
        </Txt>
      ) : null}
      <Txt variant="caption" color={tone === "neutral" ? t.muted : c.fg}>
        {message}
      </Txt>
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          role="outline"
          size="sm"
          full={false}
        />
      ) : null}
    </View>
  );
}

/** Mensaje breve no bloqueante. `onDone` se llama tras `duration` ms. */
export function Toast({
  message,
  visible,
  onDone,
  duration = 3200,
}: {
  message: string;
  visible: boolean;
  onDone: () => void;
  duration?: number;
}) {
  const t = useTheme();
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(onDone, duration);
    return () => clearTimeout(id);
  }, [visible, duration, onDone]);
  if (!visible) return null;
  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(motion.base)}
      exiting={reduced ? undefined : FadeOutDown.duration(motion.fast)}
      accessibilityLiveRegion="polite"
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: 24,
        borderRadius: radius.md,
        backgroundColor: t.text,
        paddingVertical: 14,
        paddingHorizontal: 16,
      }}
    >
      <Txt color={t.bg} style={{ fontFamily: fonts.bodySemi }}>
        {message}
      </Txt>
    </Animated.View>
  );
}
