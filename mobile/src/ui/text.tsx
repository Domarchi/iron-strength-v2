import { Text as RNText, type TextProps } from "react-native";
import { fonts, typeScale, type TextVariant } from "./tokens";
import { useTheme } from "./theme";

export type TxtProps = TextProps & {
  variant?: TextVariant;
  color?: string;
  size?: number;
  muted?: boolean;
  align?: "left" | "center" | "right";
};
/** Texto con la escala de Forja. Las cifras usan tabulares para no saltar al cambiar. */
export function Txt({
  variant = "body",
  color,
  size,
  muted,
  align,
  style,
  children,
  ...props
}: TxtProps) {
  const t = useTheme();
  const v = typeScale[variant];
  const s = size ?? v.size;
  return (
    <RNText
      {...props}
      style={[
        {
          fontFamily: fonts[v.family],
          fontSize: s,
          lineHeight: size ? Math.round(size * (v.line / v.size)) : v.line,
          letterSpacing: v.track,
          textTransform: v.upper ? "uppercase" : "none",
          color: color ?? (muted ? t.muted : t.text),
          textAlign: align,
          fontVariant: variant === "number" || variant === "display" ? ["tabular-nums"] : undefined,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
