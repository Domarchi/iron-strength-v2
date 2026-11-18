import { Pressable, Text, View } from "react-native";
import { Icon } from "./icon";
import { Input, s, usePalette } from "./ui";
export function SelectionMark({
  label,
  checked,
  onPress,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      disabled={disabled}
      onPress={onPress}
      style={{
        minWidth: 44,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 1.5,
          borderColor: checked ? p.button : p.control,
          backgroundColor: checked ? p.button : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Icon name="check" color={p.onButton} size={16} /> : null}
      </View>
    </Pressable>
  );
}
export function MoreButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
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
        minWidth: 44,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 22,
        backgroundColor: pressed ? p.raised : "transparent",
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Icon name="more" color={p.muted} size={21} />
    </Pressable>
  );
}
export function PersonalField({
  label,
  title,
  value,
  onChange,
  disabled = false,
  multiline = false,
  numeric = false,
  maxLength = 100,
}: {
  label: string;
  title?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  numeric?: boolean;
  maxLength?: number;
}) {
  const p = usePalette();
  return (
    <View style={{ flex: 1, minWidth: numeric ? 48 : 0, gap: 5 }}>
      {title ? <Text style={[s.caption, { color: p.muted }]}>{title}</Text> : null}
      <Input
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        multiline={multiline}
        maxLength={maxLength}
        keyboardType={numeric ? "decimal-pad" : "default"}
        keyboardAppearance={p.dark ? "dark" : "light"}
        selectionColor={p.blue}
        placeholderTextColor={p.muted}
        placeholder={numeric ? "—" : undefined}
        style={{
          minHeight: multiline ? 88 : 48,
          minWidth: 0,
          borderRadius: 7,
          borderWidth: 1,
          borderColor: p.control,
          color: p.ink,
          backgroundColor: p.field,
          paddingHorizontal: numeric ? 7 : 12,
          paddingVertical: 10,
          fontSize: 16,
          lineHeight: 22,
          textAlign: numeric ? "center" : "left",
          fontVariant: numeric ? ["tabular-nums"] : undefined,
          opacity: disabled ? 0.6 : 1,
        }}
      />
    </View>
  );
}
