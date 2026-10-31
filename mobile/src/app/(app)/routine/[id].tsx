import { RoutineExercisePreview } from "../../../components/routine-exercise-preview";
import { useTrainingDownload } from "../../../lib/training-download-context";
import { verifiedDownloadedTraining } from "../../../lib/downloaded-training";
import { typedPrescriptionFromLegacy } from "../../../lib/typed-training";
import { assignedCanStart } from "../../../../../src/lib/workout/training-context";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { Action, IconAction, Notice, Page, s, usePalette } from "../../../components/ui";
import { useSession } from "../../../lib/session";
import { useQuery } from "../../../lib/use-query";
import { demoRoutine } from "../../../lib/demo";
import { useTraining } from "../../../lib/training-context";
import { useWeekDownload } from "../../../lib/week-context";
import { downloadedRoutine, downloadedCanStart, downloadedAt } from "../../../lib/offline-week";
import { santiagoDate } from "../../../../../src/domain/dates";
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
    { controller: completeDownloads, bundle, download: completeDownload } = useTrainingDownload(),
    { controller, training } = useTraining();
  const demo = demoRoutine(typeof id === "string" ? id : "");
  const offline = state.status === "authenticated" && state.mode === "offline",
    userId = state.status === "authenticated" ? state.session.profile.id : "",
    pack = download.verified ? download.pack : null,
    cached = useMemo(
      () =>
        bundle
          ? (bundle.week?.sessions.find((s) => s.context.session.id === id)?.context ?? null)
          : downloadedRoutine(pack, userId, typeof id === "string" ? id : ""),
      [bundle, pack, userId, id],
    );
  const canStartLocal = (context: NonNullable<typeof cached>) =>
    context.version === 5
      ? assignedCanStart(context, userId, santiagoDate(new Date()))
      : downloadedCanStart(pack, userId, context.session.id, santiagoDate(new Date()));
  const request = useCallback(async () => {
    if (demo) return demo;
    if (offline) {
      const local = cached;
      if (!local)
        throw Error("Esta rutina no está en la descarga de tu cuenta. Conecta para consultarla.");
      return local;
    }
    return client.assignedRoutine(typeof id === "string" ? id : "");
  }, [client, id, demo, offline, cached]);
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
      if (offline && !demo && !canStartLocal(query.value))
        throw Error(
          "Solo puedes empezar rutinas de la semana vigente. Tu registro anterior sigue disponible.",
        );
      let current =
        demo ?? (offline ? cached : await client.assignedRoutine(query.value.session.id));
      if (offline && !demo && bundle) {
        const fresh = await verifiedDownloadedTraining(completeDownloads);
        current =
          fresh.week?.sessions.find((s) => s.context.session.id === query.value!.session.id)
            ?.context ?? null;
        if (!current || !assignedCanStart(current, userId, santiagoDate(new Date())))
          throw Error(
            "Solo puedes empezar rutinas de la semana vigente. Tu registro anterior sigue disponible.",
          );
        if (JSON.stringify(current) !== JSON.stringify(query.value))
          throw Error("La rutina cambió. Vuelve a revisar la vista previa antes de empezar.");
      }
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
    <Page compact>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconAction
          label="Volver"
          icon="chevronLeft"
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
      {offline && !demo && cached && (pack || bundle) ? (
        <Text style={[s.caption, { color: p.blue }]}>
          Rutina descargada · {downloadedAt(bundle?.downloadedAt ?? pack!.downloadedAt)}
        </Text>
      ) : null}
      {offline && !demo && cached && !canStartLocal(cached) ? (
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
            <Text style={[s.caption, { color: p.blue }]}>
              DEMO · Guardado solo en este dispositivo
            </Text>
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
            <Text accessibilityRole="header" style={[s.heading, { color: p.ink }]}>
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
              !completeDownload.ready ||
              completeDownload.busy ||
              (offline && completeDownload.blocked) ||
              !training.ready ||
              training.blocked ||
              !!training.active ||
              query.loading ||
              !!query.error ||
              (offline && !demo && !canStartLocal(view)) ||
              (view.version === 5 && !assignedCanStart(view, userId, santiagoDate(new Date()))) ||
              view.exercises.length === 0
            }
            busy={starting}
            onPress={() => {
              void start();
            }}
          />
          {view.exercises.map((exercise, index) => (
            <RoutineExercisePreview
              name={exercise.name}
              prescribed={
                "recordType" in exercise.prescribed
                  ? exercise.prescribed
                  : typedPrescriptionFromLegacy(exercise.prescribed)
              }
              restSeconds={exercise.restSeconds ?? null}
              supersetId={exercise.supersetId ?? null}
              supersetRestSeconds={exercise.supersetRestSeconds ?? null}
              note={exercise.note ?? null}
              alternatives={exercise.alternatives?.map((a) => ({
                ...a,
                prescribed:
                  "recordType" in a.prescribed
                    ? a.prescribed
                    : typedPrescriptionFromLegacy(a.prescribed),
              }))}
              key={exercise.sessionExerciseId}
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
