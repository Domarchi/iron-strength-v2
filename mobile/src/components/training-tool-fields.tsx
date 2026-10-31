import { Pressable, Text, View } from "react-native";
import { Action, Input, s, usePalette } from "./ui";
import { plateEquipmentSchema, type PlateEquipment } from "../../../src/domain/training-tools";
export function ToolField({
  label,
  value,
  onChange,
  integer = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  integer?: boolean;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={{ flex: 1, minWidth: 90, gap: 4 }}>
      <Text style={[s.caption, { color: p.muted }]}>{label}</Text>
      <Input
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        keyboardType={integer ? "number-pad" : "decimal-pad"}
        maxLength={16}
      />
    </View>
  );
}
export function ToolChoice<T extends string>({
  label,
  value,
  choices,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  choices: { value: T; label: string; accessibilityLabel?: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: 6 }}>
      <Text style={[s.label, { color: p.ink }]}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {choices.map((c) => (
          <Pressable
            key={c.value}
            accessibilityRole="radio"
            accessibilityLabel={c.accessibilityLabel ?? c.label}
            accessibilityState={{ checked: c.value === value, disabled }}
            aria-checked={c.value === value}
            disabled={disabled}
            onPress={() => onChange(c.value)}
            style={{
              minHeight: 48,
              minWidth: 60,
              padding: 12,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: c.value === value ? p.blue : p.control,
              backgroundColor: c.value === value ? p.tint : p.card,
            }}
          >
            <Text style={[s.label, { color: c.value === value ? p.blue : p.ink }]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export type EquipmentInput = {
  unit: PlateEquipment["unit"];
  bar: string;
  plates: { weight: string; pairs: string }[];
};
export const equipmentInput = (value: PlateEquipment): EquipmentInput => ({
  unit: value.unit,
  bar: String(value.bar),
  plates: value.plates.map((p) => ({ weight: String(p.weight), pairs: String(p.pairs) })),
});
export function toolNumber(raw: string, integer = false) {
  if (!(integer ? /^\d+$/ : /^\d+(?:[.,]\d{1,2})?$/).test(raw.trim()))
    throw Error("Revisa los números: usa hasta dos decimales y cantidades enteras de pares.");
  return Number(raw.trim().replace(",", "."));
}
export function readEquipment(input: EquipmentInput): PlateEquipment {
  const result = plateEquipmentSchema.safeParse({
    ...input,
    bar: toolNumber(input.bar),
    plates: input.plates.map((p) => ({
      weight: toolNumber(p.weight),
      pairs: toolNumber(p.pairs, true),
    })),
  });
  if (!result.success)
    throw Error(
      "Revisa el equipo: barra 0–100, discos mayores que 0 y hasta 100, sin tamaños repetidos y hasta 20 pares por tamaño.",
    );
  return result.data;
}
export function EquipmentEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: EquipmentInput;
  onChange: (v: EquipmentInput) => void;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: 10 }}>
      <ToolChoice
        label="Unidad del equipo"
        value={value.unit}
        onChange={(unit) => onChange({ ...value, unit })}
        choices={[
          { value: "kg", label: "kg" },
          { value: "lb", label: "lb" },
        ]}
        disabled={disabled}
      />
      <Text style={[s.caption, { color: p.muted }]}>
        Declara las medidas de tu equipo en la unidad elegida. Cambiar la unidad conserva los
        números para que los revises.
      </Text>
      <ToolField
        label={`Barra (${value.unit})`}
        value={value.bar}
        onChange={(bar) => onChange({ ...value, bar })}
        disabled={disabled}
      />
      {value.plates.map((plate, i) => (
        <View key={i} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <ToolField
              label={`Peso del disco ${i + 1}`}
              value={plate.weight}
              disabled={disabled}
              onChange={(weight) =>
                onChange({
                  ...value,
                  plates: value.plates.map((p, j) => (j === i ? { ...p, weight } : p)),
                })
              }
            />
            <ToolField
              label={`Pares disponibles ${i + 1}`}
              value={plate.pairs}
              disabled={disabled}
              integer
              onChange={(pairs) =>
                onChange({
                  ...value,
                  plates: value.plates.map((p, j) => (j === i ? { ...p, pairs } : p)),
                })
              }
            />
          </View>
          <Action
            label={`Quitar tamaño ${i + 1}`}
            quiet
            disabled={disabled}
            onPress={() => onChange({ ...value, plates: value.plates.filter((_, j) => i !== j) })}
          />
        </View>
      ))}
      <Action
        label="Añadir tamaño de disco"
        secondary
        disabled={disabled || value.plates.length >= 20}
        onPress={() => onChange({ ...value, plates: [...value.plates, { weight: "", pairs: "" }] })}
      />
      <Text style={[s.caption, { color: p.muted }]}>
        Un par es un disco a cada lado. No se suponen discos adicionales.
      </Text>
    </View>
  );
}
