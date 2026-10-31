import { RoutineExercisePreview } from "../../../../components/routine-exercise-preview";
import { useTrainingLibraryQuery } from "../../../../lib/training-download-query";
import { useTrainingDownload } from "../../../../lib/training-download-context";
import {
  PersonalPreviewChanged,
  downloadedPersonalRoutine,
  verifiedDownloadedTraining,
  requireSamePersonalPreview,
} from "../../../../lib/downloaded-training";
import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { useSession } from "../../../../lib/session";
import { useTraining } from "../../../../lib/training-context";
import { useLibraryDrafts } from "../../../../lib/library-context";
import { personalRoutineTrainingContext } from "../../../../lib/typed-personal-training";
import {
  Action,
  IconAction,
  Loading,
  Notice,
  Page,
  ScreenIntro,
  s,
  usePalette,
} from "../../../../components/ui";
export default function PersonalRoutinePreviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    { state } = useSession();
  const userId = state.status === "authenticated" ? state.session.profile.id : "";
  return <PersonalRoutinePreview key={`${userId}:${id}`} id={id} />;
}
function PersonalRoutinePreview({ id }: { id: string }) {
  const p = usePalette(),
    { client, state } = useSession(),
    { controller: downloads } = useTrainingDownload(),
    { controller, training } = useTraining(),
    { controller: libraryController, library } = useLibraryDrafts();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false),
    offline = state.status === "authenticated" && state.mode === "offline";
  const mounted = useRef(true),
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
  const q = useTrainingLibraryQuery();
  const routine = q.value?.routines.find((r) => r.id === id);
  async function run(edit: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    const epoch = focusEpoch.current,
      currentView = () => mounted.current && focusEpoch.current === epoch;
    const identity = client.getSnapshot();
    setBusy(true);
    setError(null);
    try {
      const saved = offline ? await verifiedDownloadedTraining(downloads) : null;
      const snapshot = saved ? saved.library : await client.trainingLibrary();
      if (!currentView()) return;
      const after = client.getSnapshot();
      if (
        identity.status !== "authenticated" ||
        after.status !== "authenticated" ||
        identity.session.profile.id !== after.session.profile.id ||
        snapshot.userId !== identity.session.profile.id
      )
        throw Error("La cuenta cambió. Vuelve a abrir la rutina.");
      const current = saved
        ? downloadedPersonalRoutine(
            saved,
            identity.status === "authenticated" ? identity.session.profile.id : "",
            id,
          )
        : snapshot.routines.find((r) => r.id === id);
      if (!current) throw Error("Esta rutina ya no está disponible.");
      if (edit) {
        await libraryController.createDraft(current);
        if (currentView()) router.push({ pathname: "/library/[id]", params: { id } });
      } else {
        if (!routine) throw Error("Vuelve a revisar la rutina antes de empezar.");
        requireSamePersonalPreview(routine, current);
        const context = personalRoutineTrainingContext(current);
        if (context.version === 3) await controller.startTyped(context);
        else await controller.startPersonal(context);
        const active = controller.getSnapshot().active;
        if (active && currentView())
          router.push({ pathname: "/workout/[id]", params: { id: active.draft.workoutId } });
      }
    } catch (e) {
      if (e instanceof PersonalPreviewChanged && currentView()) q.retry();
      if (currentView()) setError(e instanceof Error ? e.message : "No pudimos abrir la rutina.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Page compact>
      <View style={s.row}>
        <IconAction
          label="Volver a mis rutinas"
          icon="chevronLeft"
          onPress={() => router.navigate("/library")}
        />
        <Action
          label="Editar rutina"
          quiet
          disabled={
            busy || offline || !routine || library.busy || library.blocked || !!library.pending
          }
          onPress={() => {
            void run(true);
          }}
        />
      </View>
      {q.loading && !routine ? <Loading /> : null}
      {q.error ? <Notice message={q.error} retry={offline ? undefined : q.retry} /> : null}
      {error && error !== q.error ? <Notice message={error} /> : null}
      {routine ? (
        <>
          <ScreenIntro title={routine.name} />
          {q.downloadedAt ? (
            <Text style={[s.caption, { color: p.muted }]}>Rutina descargada · sin conexión</Text>
          ) : null}
          <Text style={[s.caption, { color: p.muted }]}>
            {routine.items.length} ejercicios ·{" "}
            {routine.items.reduce((n, e) => n + e.prescribed.sets, 0)} series
          </Text>
          <Action
            label="Empezar entrenamiento"
            disabled={
              busy ||
              !training.ready ||
              training.blocked ||
              training.busy ||
              training.closing ||
              !!training.active ||
              !routine.items.length
            }
            busy={busy}
            onPress={() => {
              void run(false);
            }}
          />
          {training.active ? (
            <Action
              label="Retomar entrenamiento pendiente"
              secondary
              onPress={() =>
                router.push({
                  pathname: "/workout/[id]",
                  params: { id: training.active!.draft.workoutId },
                })
              }
            />
          ) : null}
          {!routine.items.length ? (
            <Text style={[s.body, { color: p.muted }]}>Agrega ejercicios para empezar.</Text>
          ) : null}
          {routine.items.map((item, index) => (
            <RoutineExercisePreview
              key={item.id}
              name={item.name}
              index={index}
              prescribed={item.prescribed}
              restSeconds={item.restSeconds}
              note={item.note}
              supersetId={item.supersetId}
              supersetRestSeconds={item.supersetRestSeconds}
              newGroup={
                !!item.supersetId && item.supersetId !== routine.items[index - 1]?.supersetId
              }
            />
          ))}
        </>
      ) : !q.loading && !q.error ? (
        <Notice message="Esta rutina ya no está disponible." />
      ) : null}
    </Page>
  );
}
