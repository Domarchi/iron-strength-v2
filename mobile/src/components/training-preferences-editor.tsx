import { useState } from "react";
import { Text, View } from "react-native";
import { useTrainingPreferences } from "../lib/training-preferences-context";
import { Action, Notice, s, usePalette } from "./ui";
import {
  EquipmentEditor,
  ToolChoice,
  ToolField,
  equipmentInput,
  readEquipment,
  toolNumber,
} from "./training-tool-fields";
import type { TrainingPreferences } from "../lib/training-preferences";
export function TrainingPreferencesEditor() {
  const p = usePalette(),
    { controller, preferences } = useTrainingPreferences();
  const [editing, setEditing] = useState(false),
    [saved, setSaved] = useState(false);
  return (
    <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
      <Action
        label="Preferencias de entrenamiento"
        quiet
        disabled={
          !preferences.ready || preferences.busy || preferences.paused || preferences.blocked
        }
        onPress={() => {
          setEditing(true);
          setSaved(false);
        }}
      />
      {editing ? (
        <PreferencesForm
          initial={preferences.value}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setSaved(true);
          }}
        />
      ) : null}
      {saved ? (
        <Text accessibilityLiveRegion="polite" style={[s.caption, { color: p.success }]}>
          Preferencias guardadas en este dispositivo.
        </Text>
      ) : null}
      {preferences.error ? (
        <>
          <Notice message={preferences.error} />
          <Action
            label={editing ? "Releer y descartar propuesta" : "Releer preferencias"}
            secondary
            disabled={preferences.busy || preferences.paused}
            onPress={() => {
              setEditing(false);
              setSaved(false);
              void controller.restore();
            }}
          />
        </>
      ) : null}
    </View>
  );
}
function PreferencesForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: TrainingPreferences;
  onClose: () => void;
  onSaved: () => void;
}) {
  const p = usePalette(),
    { controller, preferences } = useTrainingPreferences();
  const [draft, setDraft] = useState(initial),
    [rest, setRest] = useState(String(initial.restSeconds)),
    [equipment, setEquipment] = useState(() => equipmentInput(initial.equipment)),
    [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null);
    try {
      const restSeconds = toolNumber(rest, true);
      if (restSeconds > 600 || restSeconds % 15)
        throw Error("El descanso debe ser de 0 a 600 segundos en pasos de 15.");
      await controller.save({ ...draft, restSeconds, equipment: readEquipment(equipment) });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar las preferencias.");
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <ToolChoice
        label="Peso de presentación"
        value={draft.weightUnit}
        onChange={(weightUnit) => setDraft({ ...draft, weightUnit })}
        choices={[
          { value: "kg", label: "kg", accessibilityLabel: "Peso en kg" },
          { value: "lb", label: "lb", accessibilityLabel: "Peso en lb" },
        ]}
        disabled={preferences.busy || preferences.paused}
      />
      <ToolChoice
        label="Distancia de presentación"
        value={draft.distanceUnit}
        onChange={(distanceUnit) => setDraft({ ...draft, distanceUnit })}
        choices={[
          { value: "m", label: "m" },
          { value: "km", label: "km" },
          { value: "mi", label: "mi" },
        ]}
        disabled={preferences.busy || preferences.paused}
      />
      <Text style={[s.caption, { color: p.muted }]}>
        Objetivos y equivalencias en tu unidad. Los campos de registro y edición conservan kg y
        metros; elegir una unidad no cambia tus datos.
      </Text>
      <ToolChoice
        label="Columna de objetivos"
        value={draft.showTargets ? "show" : "hide"}
        onChange={(v) => setDraft({ ...draft, showTargets: v === "show" })}
        choices={[
          { value: "show", label: "Mostrar", accessibilityLabel: "Mostrar objetivos" },
          { value: "hide", label: "Ocultar", accessibilityLabel: "Ocultar objetivos" },
        ]}
        disabled={preferences.busy || preferences.paused}
      />
      <ToolChoice
        label="Columna anterior"
        value={draft.showPrevious ? "show" : "hide"}
        onChange={(v) => setDraft({ ...draft, showPrevious: v === "show" })}
        choices={[
          { value: "show", label: "Mostrar", accessibilityLabel: "Mostrar anterior" },
          { value: "hide", label: "Ocultar", accessibilityLabel: "Ocultar anterior" },
        ]}
        disabled={preferences.busy || preferences.paused}
      />
      <ToolField
        label="Descanso habitual en segundos"
        value={rest}
        onChange={setRest}
        integer
        disabled={preferences.busy || preferences.paused}
      />
      <Text style={[s.caption, { color: p.muted }]}>
        Solo para sesiones nuevas sin descanso prescrito. No cambia el entrenamiento en curso. 0
        significa sin descanso.
      </Text>
      <Text style={[s.subheading, { color: p.ink }]}>Mi equipo de discos</Text>
      <EquipmentEditor
        value={equipment}
        onChange={setEquipment}
        disabled={preferences.busy || preferences.paused}
      />
      {error && error !== preferences.error ? <Notice message={error} /> : null}
      <Action
        label="Guardar preferencias"
        disabled={preferences.paused}
        busy={preferences.busy}
        onPress={() => {
          void save();
        }}
      />
      <Action
        label="Cancelar preferencias"
        quiet
        disabled={preferences.busy || preferences.paused}
        onPress={onClose}
      />
    </View>
  );
}
