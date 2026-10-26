import { useCallback, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { useQuery } from "../../../../lib/use-query";
import { useSession } from "../../../../lib/session";
import { useTraining } from "../../../../lib/training-context";
import { useLibraryDrafts } from "../../../../lib/library-context";
import { personalRoutineContext } from "../../../../lib/personal-training";
import {
  Action,
  Loading,
  Notice,
  Page,
  ScreenIntro,
  s,
  usePalette,
} from "../../../../components/ui";
export default function PersonalRoutinePreview() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    p = usePalette(),
    { client, state } = useSession(),
    { controller, training } = useTraining(),
    { controller: libraryController, library } = useLibraryDrafts();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [details, setDetails] = useState<string | null>(null);
  const inFlight = useRef(false),
    offline = state.status === "authenticated" && state.mode === "offline";
  const q = useQuery(
    useCallback(
      () =>
        offline
          ? Promise.reject(Error("Conecta para consultar tus rutinas personales."))
          : client.personalLibrary(),
      [client, offline],
    ),
  );
  const routine = q.value?.routines.find((r) => r.id === id);
  async function run(edit: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const current = (await client.personalLibrary()).routines.find((r) => r.id === id);
      if (!current) throw Error("Esta rutina ya no está disponible.");
      if (edit) {
        await libraryController.createDraft(current);
        router.push({ pathname: "/library/[id]", params: { id } });
      } else {
        await controller.startPersonal(personalRoutineContext(current));
        const active = controller.getSnapshot().active;
        if (active)
          router.push({ pathname: "/workout/[id]", params: { id: active.draft.workoutId } });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos abrir la rutina.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Page compact>
      <View style={s.row}>
        <Action label="Volver a mis rutinas" quiet onPress={() => router.navigate("/library")} />
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
      {error ? <Notice message={error} /> : null}
      {routine ? (
        <>
          <ScreenIntro title={routine.name} />
          <Text style={[s.caption, { color: p.muted }]}>
            {routine.items.length} ejercicios · {routine.items.reduce((n, e) => n + e.sets, 0)}{" "}
            series
          </Text>
          <Action
            label="Empezar entrenamiento"
            disabled={
              busy ||
              offline ||
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
            <View
              key={item.id}
              style={{ gap: 8, paddingVertical: 16, borderBottomWidth: 0.5, borderColor: p.border }}
            >
              {item.supersetId && item.supersetId !== routine.items[index - 1]?.supersetId ? (
                <Text style={[s.caption, { color: p.blue }]}>
                  Superserie · {item.supersetRestSeconds ?? 90} s entre rondas
                </Text>
              ) : null}
              <Text style={[s.subheading, { color: p.ink }]}>{item.name}</Text>
              <Text style={[s.body, { color: p.muted }]}>
                {item.sets} ×{" "}
                {item.repsMin === item.repsMax ? item.repsMin : `${item.repsMin}–${item.repsMax}`}{" "}
                reps
                {item.targetWeightKg !== null
                  ? ` · ${item.targetWeightKg.toLocaleString("es-CL")} kg`
                  : ""}
                {item.series ? " · Por serie" : ""}
              </Text>
              {!item.supersetId ? (
                <Text style={[s.caption, { color: p.muted }]}>
                  Descanso: {item.restSeconds ?? 90} s
                </Text>
              ) : null}
              {item.note || item.series ? (
                <Action
                  label={`Ver detalles de ${item.name}`}
                  quiet
                  onPress={() => setDetails(details === item.id ? null : item.id)}
                />
              ) : null}
              {details === item.id ? (
                <>
                  {item.note ? <Text style={[s.body, { color: p.muted }]}>{item.note}</Text> : null}
                  {item.series?.map((target, i) => (
                    <Text key={i} style={[s.caption, { color: p.ink }]}>
                      Serie {i + 1} ·{" "}
                      {target.repsMin === target.repsMax
                        ? target.repsMin
                        : `${target.repsMin}–${target.repsMax}`}{" "}
                      reps
                      {target.targetWeightKg !== null
                        ? ` · ${target.targetWeightKg.toLocaleString("es-CL")} kg`
                        : ""}
                    </Text>
                  ))}
                </>
              ) : null}
            </View>
          ))}
        </>
      ) : !q.loading && !q.error ? (
        <Notice message="Esta rutina ya no está disponible." />
      ) : null}
    </Page>
  );
}
