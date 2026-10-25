import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Action, s, usePalette } from "./ui";
import { Icon } from "./icon";
import { SetCheck } from "./set-check";
import { useTraining } from "../lib/training-context";
import {
  addSet,
  removeSet,
  targetForSet,
  toggleWarmup,
  updateSetField,
} from "../../../src/lib/workout/runner-state";

export function WorkoutSets({
  index,
  onComplete,
}: {
  index: number;
  onComplete: (setIndex: number) => Promise<unknown>;
}) {
  const p = usePalette(),
    { controller, training } = useTraining();
  const [options, showOptions] = useState<string | null>(null);
  const [error, setError] = useState<{ setId: string; message: string } | null>(null);
  const exercise = training.active?.draft.exercises[index];
  if (!exercise) return null;
  async function complete(setId: string, si: number) {
    setError(null);
    try {
      await onComplete(si);
    } catch (e) {
      setError({
        setId,
        message: `Serie ${si + 1}: ${e instanceof Error ? e.message : "No pudimos completar esta serie. Reintenta."}`,
      });
    }
  }
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Text style={[s.caption, { width: 48, color: p.muted, textAlign: "center", fontSize: 11 }]}>
          SERIE
        </Text>
        <Text style={[s.caption, { flex: 1, color: p.muted, textAlign: "center", fontSize: 11 }]}>
          KG
        </Text>
        <Text style={[s.caption, { flex: 1, color: p.muted, textAlign: "center", fontSize: 11 }]}>
          REPS
        </Text>
        <Text style={[s.caption, { width: 48, color: p.muted, textAlign: "center", fontSize: 11 }]}>
          HECHA
        </Text>
      </View>
      {exercise.sets.map((set, si) => {
        const target = targetForSet(exercise, si);
        return (
          <View
            key={set.id}
            style={{
              gap: 5,
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderBottomColor: p.border,
              borderRadius: 10,
              backgroundColor: set.done ? p.tint : "transparent",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Opciones de serie ${si + 1}`}
                accessibilityHint="Calentamiento o quitar serie"
                accessibilityState={{ expanded: options === set.id }}
                aria-expanded={options === set.id}
                onPress={() => showOptions((current) => (current === set.id ? null : set.id))}
                style={({ pressed }) => ({
                  width: 48,
                  minHeight: 48,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? p.raised : "transparent",
                  gap: 1,
                })}
              >
                <Text style={[s.label, s.number, { color: set.done ? p.blue : p.ink }]}>
                  {set.isWarmup ? "C" : si + 1}
                </Text>
                <Icon name="more" size={12} color={p.muted} />
              </Pressable>
              <TextInput
                accessibilityLabel={`Peso serie ${si + 1}`}
                keyboardAppearance={p.dark ? "dark" : "light"}
                selectionColor={p.blue}
                value={set.weight}
                keyboardType="decimal-pad"
                maxLength={7}
                placeholder={exercise.isBodyweight ? "0" : "kg"}
                placeholderTextColor={p.muted}
                onChangeText={(v) => {
                  if (error?.setId === set.id) setError(null);
                  controller.edit((draft) => updateSetField(draft, index, si, "weight", v));
                }}
                style={[
                  s.input,
                  s.number,
                  {
                    flex: 1,
                    minWidth: 0,
                    minHeight: 48,
                    paddingVertical: 11,
                    paddingHorizontal: 4,
                    textAlign: "center",
                    color: p.ink,
                    borderColor: p.control,
                    backgroundColor: p.card,
                  },
                ]}
              />
              <TextInput
                accessibilityLabel={`Repeticiones serie ${si + 1}`}
                keyboardAppearance={p.dark ? "dark" : "light"}
                selectionColor={p.blue}
                value={set.reps}
                keyboardType="number-pad"
                maxLength={3}
                placeholder={target ? String(target.repsMin) : "reps"}
                placeholderTextColor={p.muted}
                onChangeText={(v) => {
                  if (error?.setId === set.id) setError(null);
                  controller.edit((draft) => updateSetField(draft, index, si, "reps", v));
                }}
                style={[
                  s.input,
                  s.number,
                  {
                    flex: 1,
                    minWidth: 0,
                    minHeight: 48,
                    paddingVertical: 11,
                    paddingHorizontal: 4,
                    textAlign: "center",
                    color: p.ink,
                    borderColor: p.control,
                    backgroundColor: p.card,
                  },
                ]}
              />
              <SetCheck
                number={si + 1}
                checked={set.done}
                onPress={() => {
                  void complete(set.id, si);
                }}
              />
            </View>
            <Text
              style={[
                s.caption,
                { paddingLeft: 56, paddingRight: 8, color: p.muted, fontSize: 12 },
              ]}
            >
              {set.isWarmup
                ? "Calentamiento · no avanza la ronda"
                : target
                  ? `Objetivo ${target.repsMin === target.repsMax ? target.repsMin : `${target.repsMin}–${target.repsMax}`} reps${target.targetWeightKg != null ? ` · ${target.targetWeightKg.toLocaleString("es-CL")} kg` : ""}`
                  : "Serie adicional"}
            </Text>
            {error?.setId === set.id ? (
              <Text
                accessibilityRole="alert"
                style={[s.caption, { color: p.danger, paddingHorizontal: 8 }]}
              >
                {error.message}
              </Text>
            ) : null}
            {options === set.id ? (
              <View style={[s.row, { paddingTop: 4 }]}>
                <Action
                  label={set.isWarmup ? "Usar como trabajo" : "Calentamiento"}
                  accessibilityLabel={`${set.isWarmup ? "Usar como trabajo" : "Usar como calentamiento"} serie ${si + 1}`}
                  secondary
                  onPress={() => controller.edit((draft) => toggleWarmup(draft, index, si))}
                />
                {!set.done && exercise.sets.length > 1 ? (
                  <Action
                    label="Quitar"
                    accessibilityLabel={`Quitar serie ${si + 1}`}
                    secondary
                    onPress={() => controller.edit((draft) => removeSet(draft, index, si))}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
      {exercise.sets.length < 20 ? (
        <Action
          label="Añadir serie"
          quiet
          onPress={() => controller.edit((draft) => addSet(draft, index))}
        />
      ) : null}
    </View>
  );
}
