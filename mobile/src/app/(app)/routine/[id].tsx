import { useCallback, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { Action, Brand, Notice, Page, s, usePalette } from "../../../components/ui";
import { useSession } from "../../../lib/session";
import { useQuery } from "../../../lib/use-query";
import { demoRoutine } from "../../../lib/demo";
import { useTraining } from "../../../lib/training-context";
import type { MobileRoutine } from "../../../lib/client";
type Exercise = MobileRoutine["exercises"][number];
function Targets({ prescribed }: { prescribed: Exercise["prescribed"] }) {
  const p = usePalette();
  const line = (t: { repsMin: number; repsMax: number; targetWeightKg: number | null }) =>
    `${t.repsMin === t.repsMax ? t.repsMin : `${t.repsMin}–${t.repsMax}`} reps · ${t.targetWeightKg == null ? "Sin peso indicado" : `${String(t.targetWeightKg).replace(".", ",")} kg`}`;
  return prescribed.series ? (
    <View style={{ gap: 5 }}>
      {prescribed.series.map((target, index) => (
        <Text key={index} style={[s.body, { color: p.ink }]}>
          {index + 1}. {line(target)}
        </Text>
      ))}
    </View>
  ) : (
    <Text style={[s.body, { color: p.ink }]}>
      {prescribed.sets} × {line(prescribed)}
    </Text>
  );
}
function ExerciseCard({
  exercise,
  index,
  newGroup,
}: {
  exercise: Exercise;
  index: number;
  newGroup: boolean;
}) {
  const p = usePalette(),
    [open, setOpen] = useState(false);
  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: p.card,
          borderColor: p.border,
          ...(exercise.supersetId ? { borderLeftWidth: 4, borderLeftColor: p.blue } : {}),
        },
      ]}
    >
      {newGroup ? (
        <Text style={[s.caption, { color: p.blue }]}>
          SUPERSERIE
          {exercise.supersetRestSeconds != null
            ? ` · ${exercise.supersetRestSeconds === 0 ? "Sin descanso" : `${exercise.supersetRestSeconds} s al terminar la ronda`}`
            : ""}
        </Text>
      ) : null}
      <Text style={[s.subheading, { color: p.ink }]}>
        {index + 1}. {exercise.name}
      </Text>
      <Targets prescribed={exercise.prescribed} />
      {exercise.restSeconds != null && !exercise.supersetId ? (
        <Text style={[s.caption, { color: p.muted }]}>
          {exercise.restSeconds === 0 ? "Sin descanso" : `Descanso: ${exercise.restSeconds} s`}
        </Text>
      ) : null}
      {exercise.note ? <Text style={[s.body, { color: p.muted }]}>{exercise.note}</Text> : null}
      {exercise.alternatives?.length ? (
        <>
          <Action
            label={`${open ? "Ocultar" : "Ver"} alternativas de ${exercise.name}`}
            secondary
            onPress={() => setOpen((v) => !v)}
          />
          {open
            ? exercise.alternatives.map((alternative) => (
                <View
                  key={alternative.exerciseId}
                  style={{ padding: 14, gap: 6, borderRadius: 14, backgroundColor: p.tint }}
                >
                  <Text style={[s.label, { color: p.ink }]}>{alternative.name}</Text>
                  <Targets prescribed={alternative.prescribed} />
                </View>
              ))
            : null}
        </>
      ) : null}
    </View>
  );
}
export default function Routine() {
  const p = usePalette(),
    { client } = useSession(),
    { controller, training } = useTraining(),
    { id } = useLocalSearchParams<{ id: string }>();
  const demo = demoRoutine(typeof id === "string" ? id : "");
  const request = useCallback(
    () => (demo ? Promise.resolve(demo) : client.routine(typeof id === "string" ? id : "")),
    [client, id, demo],
  );
  const [starting, setStarting] = useState(false),
    [startError, setStartError] = useState<string | null>(null);
  async function start() {
    if (!query.value || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const current = demo ?? (await client.routine(query.value.session.id));
      await controller.start(current, demo ? "demo" : "real");
      const active = controller.getSnapshot().active;
      if (active)
        router.push({ pathname: "/workout/[id]", params: { id: active.draft.workoutId } });
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "No pudimos iniciar.");
    } finally {
      setStarting(false);
    }
  }
  const query = useQuery(request),
    view = query.value;
  return (
    <Page>
      <View style={s.row}>
        <Brand />
        <Action
          label="Volver"
          secondary
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/");
          }}
        />
      </View>
      {query.error ? <Notice message={query.error} retry={query.retry} /> : null}
      {query.loading ? (
        <ActivityIndicator color={p.blue} accessibilityLabel="Cargando rutina" />
      ) : null}
      {startError ? <Notice message={startError} /> : null}
      {training.blocked ? (
        <Notice
          message={training.error ?? "No pudimos recuperar el registro local."}
          retry={() => {
            void controller.restore();
          }}
        />
      ) : null}
      {view ? (
        <>
          {demo ? (
            <Notice message="DEMO · Rutina de ejemplo. Sus resultados quedan solo en este dispositivo y no se envían al coach." />
          ) : null}
          {training.active ? (
            <Action
              label="Retomar entrenamiento pendiente"
              onPress={() =>
                router.push({
                  pathname: "/workout/[id]",
                  params: { id: training.active!.draft.workoutId },
                })
              }
            />
          ) : null}
          <View style={{ gap: 7 }}>
            <Text style={[s.caption, { color: p.blue }]}>
              SESIÓN {view.session.label} · SEMANA {view.session.weekNumber}
            </Text>
            <Text style={[s.heading, { color: p.ink }]}>
              {view.session.title ?? `Rutina ${view.session.label}`}
            </Text>
            <Text style={[s.body, { color: p.muted }]}>
              {view.session.programName} · {view.exercises.length} ejercicios ·{" "}
              {view.exercises.reduce((n, e) => n + e.prescribed.sets, 0)} series
            </Text>
          </View>
          <Action
            label={demo ? "Probar entrenamiento demo" : "Empezar entrenamiento"}
            disabled={
              !training.ready ||
              training.blocked ||
              !!training.active ||
              view.exercises.length === 0
            }
            busy={starting}
            onPress={() => {
              void start();
            }}
          />
          {view.exercises.map((exercise, index) => (
            <ExerciseCard
              key={exercise.sessionExerciseId}
              exercise={exercise}
              index={index}
              newGroup={
                !!exercise.supersetId &&
                exercise.supersetId !== view.exercises[index - 1]?.supersetId
              }
            />
          ))}
          {view.exercises.length === 0 ? (
            <Notice message="Tu coach aún no ha añadido ejercicios a esta sesión." />
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
