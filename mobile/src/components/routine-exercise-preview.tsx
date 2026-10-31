import { useState } from "react";
import { Text, View } from "react-native";
import type { TrainingPrescription } from "../../../src/domain/training-metrics";
import { useTrainingPreferences } from "../lib/training-preferences-context";
import { formatTrainingTarget } from "../lib/training-labels";
import { Action, s, usePalette } from "./ui";

function Targets({ prescribed }: { prescribed: TrainingPrescription }) {
  const p = usePalette(),
    { preferences } = useTrainingPreferences();
  return prescribed.series ? (
    <View style={{ gap: 3 }}>
      {prescribed.series.map((target, index) => (
        <Text key={index} style={[s.caption, { color: p.muted }]}>
          {index + 1}. {formatTrainingTarget(target, preferences.value) || "Objetivo libre"}
        </Text>
      ))}
    </View>
  ) : (
    <Text style={[s.body, { color: p.muted }]}>
      {prescribed.sets} ×{" "}
      {formatTrainingTarget(prescribed.target, preferences.value) || "Objetivo libre"}
    </Text>
  );
}

/** Read-only: consulting prescriptions never creates or edits a training draft. */
export function RoutineExercisePreview({
  name,
  index,
  prescribed,
  restSeconds,
  supersetId,
  supersetRestSeconds,
  newGroup,
  note,
  alternatives = [],
}: {
  name: string;
  index: number;
  prescribed: TrainingPrescription;
  restSeconds: number | null;
  supersetId: string | null;
  supersetRestSeconds: number | null;
  newGroup: boolean;
  note: string | null;
  alternatives?: { exerciseId: string; name: string; prescribed: TrainingPrescription }[];
}) {
  const p = usePalette(),
    [open, setOpen] = useState(false);
  return (
    <View
      style={{
        gap: 8,
        paddingVertical: 16,
        borderBottomWidth: 0.5,
        borderBottomColor: p.border,
        ...(supersetId ? { borderLeftWidth: 2, borderLeftColor: p.blue, paddingLeft: 12 } : {}),
      }}
    >
      {newGroup ? (
        <Text style={[s.caption, { color: p.blue }]}>
          SUPERSERIE ·{" "}
          {supersetRestSeconds === 0
            ? "Sin descanso"
            : `${supersetRestSeconds ?? 90} s al terminar la ronda`}
        </Text>
      ) : null}
      <Text style={[s.label, { color: p.ink, fontSize: 17, lineHeight: 23 }]}>
        {index + 1}. {name}
      </Text>
      <Targets prescribed={prescribed} />
      {!supersetId ? (
        <Text style={[s.caption, { color: p.muted }]}>
          {restSeconds === 0 ? "Sin descanso" : `Descanso: ${restSeconds ?? 90} s`}
        </Text>
      ) : null}
      {note || alternatives.length ? (
        <Action
          quiet
          label={
            alternatives.length
              ? `${open ? "Ocultar" : "Ver"} alternativas de ${name}`
              : `${open ? "Ocultar" : "Ver"} detalles de ${name}`
          }
          onPress={() => setOpen((value) => !value)}
        />
      ) : null}
      {open ? (
        <View style={{ gap: 12 }}>
          {note ? <Text style={[s.body, { color: p.muted }]}>{note}</Text> : null}
          {alternatives.map((alternative) => (
            <View
              key={alternative.exerciseId}
              style={{ gap: 6, borderLeftWidth: 2, borderLeftColor: p.border, paddingLeft: 12 }}
            >
              <Text style={[s.label, { color: p.ink }]}>{alternative.name}</Text>
              <Targets prescribed={alternative.prescribed} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
