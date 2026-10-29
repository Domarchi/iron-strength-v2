import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MUSCLE_GROUPS } from "../../../src/domain/schemas";
import { RECORD_TYPES } from "../../../src/domain/training-metrics";
import { RECORD_TYPE_LABELS } from "../lib/training-labels";
import {
  type PersonalExerciseDraft,
  type PersonalExerciseForm as Form,
} from "../lib/personal-exercise-drafts";
import { Action, ScreenIntro, s, usePalette } from "./ui";
import { Icon } from "./icon";
export function PersonalExerciseForm({
  draft,
  disabled,
  saveDisabled,
  onEdit,
  onSave,
  onBack,
  onDiscard,
  children,
}: {
  draft: PersonalExerciseDraft;
  disabled: boolean;
  saveDisabled: boolean;
  onEdit: (patch: Partial<Form>) => void;
  onSave: () => void;
  onBack: () => void;
  onDiscard: () => void;
  children: React.ReactNode;
}) {
  const p = usePalette(),
    insets = useSafeAreaInsets();
  const [picker, setPicker] = useState<"type" | "muscle" | null>(null),
    [settings, setSettings] = useState(false);
  const inputStyle = [s.input, { color: p.ink, borderColor: p.control, backgroundColor: p.card }];
  const hasLoad =
    draft.values.recordType === null ||
    [
      "weight_reps",
      "weighted_bodyweight",
      "assisted_bodyweight",
      "weight_duration",
      "weight_distance",
    ].includes(draft.values.recordType);
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          gap: 18,
          padding: 20,
          paddingBottom: insets.bottom + 28,
          maxWidth: 560,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <Action label="Volver a mis ejercicios" quiet onPress={onBack} />
        <ScreenIntro title={draft.base ? "Editar ejercicio" : "Nuevo ejercicio"} />
        {children}
        <Text style={[s.label, { color: p.ink }]}>Nombre</Text>
        <TextInput
          accessibilityLabel="Nombre del ejercicio"
          placeholder="Nombre del ejercicio"
          placeholderTextColor={p.muted}
          value={draft.values.name}
          editable={!disabled}
          maxLength={100}
          onChangeText={(name) => onEdit({ name })}
          style={inputStyle}
        />
        <View style={{ gap: 6 }}>
          <Text style={[s.caption, { color: p.muted }]}>Registro</Text>
          <Text style={[s.label, { color: p.ink }]}>
            {draft.values.recordType
              ? RECORD_TYPE_LABELS[draft.values.recordType]
              : "Peso y repeticiones"}
          </Text>
          {!draft.base ? (
            <Action
              label="Tipo de registro"
              quiet
              disabled={disabled}
              onPress={() => setPicker(picker === "type" ? null : "type")}
            />
          ) : null}
          {picker === "type" && !draft.base
            ? RECORD_TYPES.map((recordType) => (
                <Action
                  key={recordType}
                  label={`Tipo ${RECORD_TYPE_LABELS[recordType]}`}
                  secondary
                  disabled={disabled}
                  onPress={() => {
                    onEdit({ recordType });
                    setPicker(null);
                  }}
                />
              ))
            : null}
        </View>
        <View style={{ gap: 6 }}>
          <Text style={[s.caption, { color: p.muted }]}>Músculo</Text>
          <Text style={[s.label, { color: p.ink }]}>{draft.values.muscleGroup}</Text>
          <Action
            label="Cambiar músculo"
            quiet
            disabled={disabled}
            onPress={() => setPicker(picker === "muscle" ? null : "muscle")}
          />
          {picker === "muscle" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {MUSCLE_GROUPS.map((muscleGroup) => (
                <Action
                  key={muscleGroup}
                  label={`Músculo ${muscleGroup}`}
                  secondary
                  disabled={disabled}
                  onPress={() => {
                    onEdit({ muscleGroup });
                    setPicker(null);
                  }}
                />
              ))}
            </View>
          ) : null}
        </View>
        <Text style={[s.label, { color: p.ink }]}>Equipo · opcional</Text>
        <TextInput
          accessibilityLabel="Equipo del ejercicio"
          placeholder="Barra, mancuerna…"
          placeholderTextColor={p.muted}
          value={draft.values.equipment}
          editable={!disabled}
          maxLength={50}
          onChangeText={(equipment) => onEdit({ equipment })}
          style={inputStyle}
        />
        <Action
          label="Ajustes del ejercicio"
          quiet
          disabled={disabled}
          onPress={() => setSettings((v) => !v)}
        />
        {settings ? (
          <View style={{ gap: 12 }}>
            {hasLoad ? (
              <>
                <Text style={[s.label, { color: p.ink }]}>Incremento de carga · kg</Text>
                <TextInput
                  accessibilityLabel="Incremento de carga (kg)"
                  inputMode="decimal"
                  value={draft.values.progressionIncrementKg}
                  maxLength={30}
                  editable={!disabled}
                  onChangeText={(progressionIncrementKg) => onEdit({ progressionIncrementKg })}
                  style={inputStyle}
                />
              </>
            ) : null}
            <Pressable
              accessibilityRole="checkbox"
              aria-checked={draft.values.isBodyweight}
              accessibilityLabel="Ejercicio con peso corporal"
              accessibilityState={{ checked: draft.values.isBodyweight, disabled }}
              disabled={disabled}
              onPress={() => onEdit({ isBodyweight: !draft.values.isBodyweight })}
              style={{
                minHeight: 48,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 10,
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderWidth: 1,
                  borderColor: p.control,
                  borderRadius: 10,
                  backgroundColor: draft.values.isBodyweight ? p.button : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {draft.values.isBodyweight ? <Icon name="check" color="#fff" size={14} /> : null}
              </View>
              <Text style={[s.body, { color: p.ink, flexShrink: 1 }]}>Usa peso corporal</Text>
            </Pressable>
          </View>
        ) : null}
        <Action label="Guardar ejercicio" disabled={disabled || saveDisabled} onPress={onSave} />
        <Action
          label="Descartar cambios del ejercicio"
          secondary
          disabled={disabled}
          onPress={onDiscard}
        />
      </ScrollView>
    </View>
  );
}
