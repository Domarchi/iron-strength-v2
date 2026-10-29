import { useTrainingPreferences } from "../../../lib/training-preferences-context";
import { formatTrainingTarget } from "../../../lib/training-labels";
import { typedPrescriptionFromLegacy } from "../../../lib/typed-training";
import {
  assignedCanStart,
  type AssignedTrainingContext,
} from "../../../../../src/lib/workout/training-context";
import type { TrainingPrescription } from "../../../../../src/domain/training-metrics";
import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { Action, Brand, Notice, Page, s, usePalette } from "../../../components/ui";
import { useSession } from "../../../lib/session";
import { useQuery } from "../../../lib/use-query";
import { demoRoutine } from "../../../lib/demo";
import { useTraining } from "../../../lib/training-context";
import { useWeekDownload } from "../../../lib/week-context";
import { downloadedRoutine, downloadedCanStart, downloadedAt } from "../../../lib/offline-week";
import { santiagoDate } from "../../../../../src/domain/dates";
import type { MobileRoutine } from "../../../lib/client";
type Exercise = MobileRoutine["exercises"][number] | AssignedTrainingContext["exercises"][number];
function Targets({ prescribed }: { prescribed: Exercise["prescribed"] }) {
  const { preferences } = useTrainingPreferences(),
    p = usePalette();
  const rx: TrainingPrescription =
    "recordType" in prescribed ? prescribed : typedPrescriptionFromLegacy(prescribed);
  return rx.series ? (
    <View style={{ gap: 5 }}>
      {rx.series.map((target, index) => (
        <Text key={index} style={[s.body, { color: p.ink }]}>
          {index + 1}. {formatTrainingTarget(target, preferences.value) || "Objetivo libre"}
        </Text>
      ))}
    </View>
  ) : (
    <Text style={[s.body, { color: p.ink }]}>
      {rx.sets} × {formatTrainingTarget(rx.target, preferences.value) || "Objetivo libre"}
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
        s.divider,
        {
          borderColor: p.border,
          ...(exercise.supersetId
            ? { borderLeftWidth: 2, borderLeftColor: p.blue, paddingLeft: 16 }
            : {}),
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
export default function RoutineRoute() {
  const { state } = useSession(),
    { id } = useLocalSearchParams<{ id: string }>();
  const userId = state.status === "authenticated" ? state.session.profile.id : "";
  return <Routine key={`${userId}:${id}`} id={id} />;
}
function Routine({ id }: { id: string }) {
  const p = usePalette(),
    { client, state } = useSession(),
    { download } = useWeekDownload(),
    { controller, training } = useTraining();
  const demo = demoRoutine(typeof id === "string" ? id : "");
  const offline = state.status === "authenticated" && state.mode === "offline",
    userId = state.status === "authenticated" ? state.session.profile.id : "",
    pack = download.verified ? download.pack : null,
    cached = downloadedRoutine(pack, userId, typeof id === "string" ? id : "");
  const request = useCallback(async () => {
    if (demo) return demo;
    if (offline) {
      const local = downloadedRoutine(pack, userId, typeof id === "string" ? id : "");
      if (!local)
        throw Error("Esta rutina no está en la descarga de tu cuenta. Conecta para consultarla.");
      return local;
    }
    return client.assignedRoutine(typeof id === "string" ? id : "");
  }, [client, id, demo, offline, pack, userId]);
  const [starting, setStarting] = useState(false),
    [startError, setStartError] = useState<string | null>(null);
  const inFlight = useRef(false),
    mounted = useRef(true),
    focusEpoch = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const epoch = focusEpoch;
    return () => {
      mounted.current = false;
      epoch.current++;
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      focusEpoch.current++;
      return () => {
        focusEpoch.current++;
      };
    }, []),
  );
  async function start() {
    if (!query.value || inFlight.current || starting || query.loading || query.error) return;
    inFlight.current = true;
    const epoch = focusEpoch.current,
      currentView = () => mounted.current && focusEpoch.current === epoch;
    setStarting(true);
    setStartError(null);
    try {
      if (
        offline &&
        !demo &&
        !downloadedCanStart(pack, userId, query.value.session.id, santiagoDate(new Date()))
      )
        throw Error(
          "Solo puedes empezar rutinas de la semana vigente. Tu registro anterior sigue disponible.",
        );
      const current =
        demo ??
        (offline
          ? downloadedRoutine(pack, userId, query.value.session.id)
          : await client.assignedRoutine(query.value.session.id));
      if (!current)
        throw Error("No pudimos verificar la rutina descargada. Conservamos tus datos.");
      if (!currentView()) return;
      const after = client.getSnapshot();
      if (after.status !== "authenticated" || after.session.profile.id !== userId)
        throw Error("La cuenta cambió. Vuelve a abrir la rutina.");
      if (current.version === 5) await controller.startTyped(current);
      else await controller.start(current, demo ? "demo" : "real");
      const active = controller.getSnapshot().active;
      if (active && currentView())
        router.push({ pathname: "/workout/[id]", params: { id: active.draft.workoutId } });
    } catch (e) {
      if (currentView()) setStartError(e instanceof Error ? e.message : "No pudimos iniciar.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setStarting(false);
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
      {query.loading && !query.value ? (
        <ActivityIndicator color={p.blue} accessibilityLabel="Cargando rutina" />
      ) : null}
      {startError ? <Notice message={startError} /> : null}
      {offline && !demo && cached && pack ? (
        <Text style={[s.caption, { color: p.blue }]}>
          Rutina descargada · {downloadedAt(pack.downloadedAt)}
        </Text>
      ) : null}
      {offline &&
      !demo &&
      cached &&
      !downloadedCanStart(pack, userId, cached.session.id, santiagoDate(new Date())) ? (
        <Notice message="Puedes consultar esta copia y retomar un registro previo. Conecta para empezar una rutina de la semana vigente." />
      ) : null}
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
              query.loading ||
              !!query.error ||
              (offline &&
                !demo &&
                !downloadedCanStart(pack, userId, view.session.id, santiagoDate(new Date()))) ||
              (view.version === 5 && !assignedCanStart(view, userId, santiagoDate(new Date()))) ||
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
