import { useCallback, useState, type PropsWithChildren } from "react";
import { useFocusEffect } from "expo-router";
import { Text, View } from "react-native";
import { Action, day, s, usePalette } from "./ui";
import { WorkoutPanel } from "./workout-panel";

export function ResultHeading({
  title,
  date,
  workingSets,
  exerciseCount,
  durationSeconds,
  demo = false,
}: {
  title: string;
  date: string;
  workingSets: number;
  exerciseCount: number;
  durationSeconds: number;
  demo?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: 8 }}>
      <Text style={[s.caption, { color: p.success }]}>
        {demo ? "DEMO GUARDADA EN ESTE DISPOSITIVO" : "ENTRENAMIENTO CONFIRMADO"}
      </Text>
      <Text accessibilityRole="header" style={[s.heading, { color: p.ink }]}>
        {title}
      </Text>
      <Text style={[s.caption, { color: p.muted }]}>
        {day(date)} · {workingSets} {workingSets === 1 ? "serie" : "series"} · {exerciseCount}{" "}
        {exerciseCount === 1 ? "ejercicio" : "ejercicios"} · {Math.round(durationSeconds / 60)} min
      </Text>
      {demo ? (
        <Text style={[s.caption, { color: p.muted }]}>
          Esta prueba se guarda solo en este dispositivo.
        </Text>
      ) : null}
    </View>
  );
}

/** Existing routes keep their own review, identity and pending-operation guards. */
export function ResultOptions({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  useFocusEffect(useCallback(() => () => setOpen(false), []));
  return (
    <>
      <Action
        label="Opciones"
        accessibilityLabel="Opciones del entrenamiento"
        icon="more"
        quiet
        onPress={() => setOpen(true)}
      />
      {open ? (
        <WorkoutPanel title="Opciones del entrenamiento" onClose={() => setOpen(false)}>
          {children}
        </WorkoutPanel>
      ) : null}
    </>
  );
}

export function ResultNote({
  note,
  label = "Nota del entrenamiento",
}: {
  note: string | null;
  label?: string;
}) {
  const p = usePalette(),
    [expanded, setExpanded] = useState(false);
  if (!note) return null;
  const long = note.length > 100;
  return (
    <View style={{ gap: 4 }}>
      <Text numberOfLines={long && !expanded ? 3 : undefined} style={[s.body, { color: p.muted }]}>
        {note}
      </Text>
      {long ? (
        <Action
          label={expanded ? "Contraer nota" : "Ver nota completa"}
          accessibilityLabel={`${expanded ? "Contraer" : "Leer"} ${label}`}
          quiet
          onPress={() => setExpanded((value) => !value)}
        />
      ) : null}
    </View>
  );
}
