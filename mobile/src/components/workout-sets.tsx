import { useState } from "react";
import { Pressable, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Action, s, usePalette } from "./ui";
import { Icon } from "./icon";
import { SetCheck } from "./set-check";
import { useTraining } from "../lib/training-context";
import { useWeekDownload } from "../lib/week-context";
import { useSession } from "../lib/session";
import { downloadedHistory } from "../lib/offline-week";
import {
  addSet,
  copyPrevious,
  previousForSet,
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
    { controller, training } = useTraining(),
    { download } = useWeekDownload(),
    { state } = useSession(),
    { width, fontScale } = useWindowDimensions();
  const [options, showOptions] = useState<string | null>(null);
  const [error, setError] = useState<{ setId: string; message: string } | null>(null);
  const exercise = training.active?.draft.exercises[index];
  const blocked =
    training.busy ||
    training.closing ||
    training.active?.pause?.pausedAtMs != null ||
    training.active?.draft.status === "pending_save";
  if (!exercise) return null;
  const history =
      state.status === "authenticated" && training.active?.mode === "real"
        ? downloadedHistory(
            download.verified ? download.pack : null,
            state.session.profile.id,
            exercise.exerciseId,
          )
        : null,
    last = history?.items[0] ?? null,
    previousColumn = width >= 360 && fontScale <= 1.15;
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
    <View style={{ gap: 2 }}>
      {!exercise.prescribed.series ? (
        <Text style={[s.caption, { color: p.muted, marginBottom: 8 }]}>
          Objetivo{" "}
          {exercise.prescribed.repsMin === exercise.prescribed.repsMax
            ? exercise.prescribed.repsMin
            : `${exercise.prescribed.repsMin}–${exercise.prescribed.repsMax}`}{" "}
          reps
          {exercise.prescribed.targetWeightKg != null
            ? ` · ${exercise.prescribed.targetWeightKg.toLocaleString("es-CL")} kg`
            : ""}
        </Text>
      ) : null}
      {last ? (
        <Text style={[s.caption, { color: p.muted, marginBottom: 8 }]}>
          Anterior · {last.date.split("-").reverse().slice(0, 2).join("/")} · copia descargada
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
        <Text style={[s.caption, { width: 44, color: p.muted, textAlign: "center", fontSize: 11 }]}>
          SERIE
        </Text>
        {previousColumn ? (
          <Text
            style={[s.caption, { width: 72, color: p.muted, textAlign: "center", fontSize: 11 }]}
          >
            ANTERIOR
          </Text>
        ) : null}
        <Text style={[s.caption, { flex: 1, color: p.muted, textAlign: "center", fontSize: 11 }]}>
          KG
        </Text>
        <Text style={[s.caption, { flex: 1, color: p.muted, textAlign: "center", fontSize: 11 }]}>
          REPS
        </Text>
        <View style={{ width: 48, alignItems: "center" }}>
          <Icon name="check" size={16} color={p.muted} />
        </View>
      </View>
      {exercise.sets.map((set, si) => {
        const target = targetForSet(exercise, si),
          previous = previousForSet(last, exercise, si),
          previousValue = previous ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Copiar anterior a serie ${si + 1}`}
              accessibilityHint={`${previous.weightKg.toLocaleString("es-CL")} kg y ${previous.reps} repeticiones. Copia solo al tocar.`}
              accessibilityState={{ disabled: set.done || blocked }}
              disabled={set.done || blocked}
              onPress={() => {
                if (error?.setId === set.id) setError(null);
                controller.edit((draft) => copyPrevious(draft, index, si, previous));
              }}
              style={({ pressed }) => ({
                width: previousColumn ? 72 : undefined,
                minHeight: 48,
                justifyContent: "center",
                alignItems: previousColumn ? "center" : "flex-start",
                borderRadius: 6,
                backgroundColor: pressed ? p.raised : "transparent",
              })}
            >
              <Text style={[s.caption, s.number, { color: p.muted, fontSize: 12 }]}>
                {previousColumn ? "" : "Anterior · "}
                {previous.weightKg.toLocaleString("es-CL")} × {previous.reps}
              </Text>
            </Pressable>
          ) : (
            <Text
              accessibilityLabel={`Sin referencia anterior para serie ${si + 1}`}
              style={[
                s.caption,
                { width: previousColumn ? 72 : undefined, color: p.muted, textAlign: "center" },
              ]}
            >
              {previousColumn ? "—" : "Anterior · —"}
            </Text>
          );
        return (
          <View
            key={set.id}
            style={{
              gap: 2,
              paddingVertical: 3,
              borderRadius: 6,
              backgroundColor: set.done ? p.completed : "transparent",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Opciones de serie ${si + 1}`}
                accessibilityHint="Calentamiento o quitar serie"
                accessibilityState={{ expanded: options === set.id, disabled: blocked }}
                disabled={blocked}
                aria-expanded={options === set.id}
                onPress={() => showOptions((current) => (current === set.id ? null : set.id))}
                style={({ pressed }) => ({
                  width: 44,
                  minHeight: 48,
                  borderRadius: 6,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? p.raised : "transparent",
                  gap: 1,
                })}
              >
                <Text style={[s.label, s.number, { color: set.done ? p.success : p.ink }]}>
                  {set.isWarmup ? "C" : si + 1}
                </Text>
                <Icon name="more" size={12} color={p.muted} />
              </Pressable>
              {previousColumn ? previousValue : null}
              <TextInput
                accessibilityLabel={`Peso serie ${si + 1}`}
                editable={!blocked}
                accessibilityState={{ disabled: blocked }}
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
                    borderWidth: 0,
                    borderBottomWidth: 1,
                    borderRadius: 6,
                    backgroundColor: set.done ? p.completed : p.raised,
                  },
                ]}
              />
              <TextInput
                accessibilityLabel={`Repeticiones serie ${si + 1}`}
                editable={!blocked}
                accessibilityState={{ disabled: blocked }}
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
                    borderWidth: 0,
                    borderBottomWidth: 1,
                    borderRadius: 6,
                    backgroundColor: set.done ? p.completed : p.raised,
                  },
                ]}
              />
              <SetCheck
                number={si + 1}
                checked={set.done}
                disabled={blocked}
                onPress={() => {
                  void complete(set.id, si);
                }}
              />
            </View>
            {!previousColumn ? <View style={{ paddingLeft: 48 }}>{previousValue}</View> : null}
            {set.isWarmup || exercise.prescribed.series || !target ? (
              <Text
                style={[
                  s.caption,
                  { paddingLeft: 48, paddingRight: 8, color: p.muted, fontSize: 12 },
                ]}
              >
                {set.isWarmup
                  ? "Calentamiento · no avanza la ronda"
                  : target
                    ? `Objetivo ${target.repsMin === target.repsMax ? target.repsMin : `${target.repsMin}–${target.repsMax}`} reps${target.targetWeightKg != null ? ` · ${target.targetWeightKg.toLocaleString("es-CL")} kg` : ""}`
                    : "Serie adicional"}
              </Text>
            ) : null}
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
                  disabled={blocked}
                  onPress={() => controller.edit((draft) => toggleWarmup(draft, index, si))}
                />
                {!set.done && exercise.sets.length > 1 ? (
                  <Action
                    label="Quitar"
                    accessibilityLabel={`Quitar serie ${si + 1}`}
                    secondary
                    disabled={blocked}
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
          disabled={blocked}
          onPress={() => controller.edit((draft) => addSet(draft, index))}
        />
      ) : null}
    </View>
  );
}
