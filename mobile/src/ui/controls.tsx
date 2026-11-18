import { useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import { Icon } from "../components/icon";
import { fonts, radius } from "./tokens";
import { useTheme } from "./theme";
import { Txt } from "./text";

/** Selector de una opción entre pocas. Cada opción mide al menos 44 px y es un radio accesible. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        backgroundColor: t.surface2,
        borderRadius: radius.sm,
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.sm - 2,
              backgroundColor: on ? t.surface : "transparent",
              borderWidth: 1,
              borderColor: on ? t.line : "transparent",
            }}
          >
            <Txt style={{ fontFamily: fonts.bodySemi }} size={14} color={on ? t.text : t.muted}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      role="switch"
      aria-checked={value}
      aria-label={label}
      accessibilityLabel={label}
      accessibilityHint={description}
      onPress={() => onChange(!value)}
      style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={{ fontFamily: fonts.bodySemi }}>{label}</Txt>
        {description ? (
          <Txt variant="caption" muted>
            {description}
          </Txt>
        ) : null}
      </View>
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 52,
          height: 32,
          borderRadius: 16,
          padding: 3,
          justifyContent: "center",
          backgroundColor: value ? t.accent : t.surface2,
          borderWidth: 1,
          borderColor: value ? t.accent : t.line,
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            alignSelf: value ? "flex-end" : "flex-start",
            backgroundColor: value ? t.onAccent : t.muted,
          }}
        />
      </View>
    </Pressable>
  );
}

/** Ajuste de una cantidad con pasos (peso, descanso). */
export function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  unit,
  format = (n: number) => String(n).replace(".", ","),
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  format?: (n: number) => string;
}) {
  const t = useTheme();
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Math.round(n * 100) / 100)));
  const btn = (name: "minus" | "plus", delta: number, text: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ disabled: delta < 0 ? value <= min : value >= max }}
      disabled={delta < 0 ? value <= min : value >= max}
      onPress={() => set(value + delta)}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: radius.sm,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? t.line : t.surface2,
        opacity: (delta < 0 ? value <= min : value >= max) ? 0.4 : 1,
      })}
    >
      <Icon name={name} size={20} color={t.text} />
    </Pressable>
  );
  return (
    <View accessible={false} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      {btn("minus", -step, `Bajar ${label}`)}
      <View
        accessible
        role="spinbutton"
        aria-label={label}
        aria-valuenow={value}
        aria-valuetext={`${format(value)}${unit ? ` ${unit}` : ""}`}
        accessibilityLabel={label}
        style={{ minWidth: 84, alignItems: "center" }}
      >
        <Txt variant="number" size={26}>
          {format(value)}
        </Txt>
        {unit ? (
          <Txt variant="caption" muted>
            {unit}
          </Txt>
        ) : null}
      </View>
      {btn("plus", step, `Subir ${label}`)}
    </View>
  );
}

/** Campo con etiqueta, ayuda y error. El error se anuncia como alerta. */
export function TextField({
  label,
  hint,
  error,
  ...props
}: TextInputProps & { label: string; hint?: string; error?: string }) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="caption" style={{ fontFamily: fonts.bodySemi }}>
        {label}
      </Txt>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={t.muted}
        selectionColor={t.accent}
        keyboardAppearance={t.dark ? "dark" : "light"}
        underlineColorAndroid="transparent"
        onFocus={(e) => {
          setFocus(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          props.onBlur?.(e);
        }}
        style={[
          {
            minHeight: 52,
            borderRadius: radius.sm,
            borderWidth: 1.5,
            paddingHorizontal: 14,
            fontFamily: fonts.body,
            fontSize: 16,
            color: t.text,
            backgroundColor: t.surface2,
            borderColor: error ? t.danger : focus ? t.accent : "transparent",
          },
          props.style,
        ]}
      />
      {error ? (
        <Txt accessibilityRole="alert" variant="caption" color={t.danger}>
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="caption" muted>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}
