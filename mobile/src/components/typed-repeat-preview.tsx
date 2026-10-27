import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { prepareTypedWorkoutRepeat } from "../../../src/domain/typed-workout-repeat";
import { formatTrainingMetrics, type TrainingTarget } from "../../../src/domain/training-metrics";
import { exerciseBlocks } from "../../../src/domain/supersets";
import { useQuery } from "../lib/use-query";
import { useSession } from "../lib/session";
import { useTraining } from "../lib/training-context";
import { RECORD_TYPE_LABELS, SET_TYPE_LABELS, formatTrainingTarget } from "../lib/training-labels";
import { Action, Loading, Notice, Page, ScreenIntro, day, s, usePalette } from "./ui";

const warnings = {
  unperformed: "Se incluyen solo los ejercicios con series registradas.",
  incomplete_group: "Una superserie queda individual y conserva el descanso de la ronda.",
  warmups_only: "Hay ejercicios que solo tienen calentamientos.",
};
const targetLabel = (t: TrainingTarget) => formatTrainingTarget(t) || "Sin objetivo numérico";
export function TypedRepeatPreview({ id }: { id: string }) {
  const p = usePalette(),
    { client, state } = useSession(),
    { controller, training } = useTraining();
  const offline = state.status === "authenticated" && state.mode === "offline";
  const q = useQuery(
    useCallback(async () => {
      const identity = client.getSnapshot();
      if (offline || identity.status !== "authenticated")
        throw Error("Conecta para preparar la repetición.");
      const [result, catalog] = await Promise.all([
        client.typedWorkout(id),
        client.trainingCatalog(),
      ]);
      const current = client.getSnapshot();
      if (
        current.status !== "authenticated" ||
        current.session.profile.id !== identity.session.profile.id
      )
        throw Error("La cuenta cambió. Vuelve a abrir este resultado.");
      return {
        userId: identity.session.profile.id,
        prepared: prepareTypedWorkoutRepeat(result.workout, catalog.exercises),
      };
    }, [client, id, offline]),
  );
  const [needsReview, setNeedsReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [expanded, setExpanded] = useState<number | null>(null);
  const inFlight = useRef(false),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const prepared = q.value?.prepared,
    plan = prepared?.ok ? prepared.plan : null,
    active = training.active;
  const blocks = plan
    ? exerciseBlocks(plan.exercises.map((e) => ({ ...e, id: String(e.sourcePosition) })))
    : [];
  async function begin() {
    const source = q.value;
    if (inFlight.current || !source?.prepared.ok || q.loading || q.error || offline || needsReview)
      return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const identity = client.getSnapshot();
      if (
        identity.status !== "authenticated" ||
        identity.mode !== "online" ||
        identity.session.profile.id !== source.userId
      )
        throw Error("Comprueba tu cuenta y conexión antes de empezar.");
      const latest = await client.trainingCatalog();
      if (!live.current) return;
      const after = client.getSnapshot();
      if (
        after.status !== "authenticated" ||
        after.mode !== "online" ||
        after.session.profile.id !== source.userId
      )
        throw Error("La cuenta o conexión cambió. Vuelve a revisar la repetición.");
      const available = new Map(latest.exercises.map((e) => [e.id, e]));
      if (
        source.prepared.plan.exercises.some((e) => {
          const metadata = available.get(e.exerciseId);
          return (
            !metadata ||
            metadata.recordType !== e.prescribed.recordType ||
            metadata.name !== e.name ||
            metadata.isBodyweight !== e.isBodyweight
          );
        })
      ) {
        setNeedsReview(true);
        throw Error("El catálogo cambió. Actualiza la vista previa antes de empezar.");
      }
      await controller.startRepeated(source.prepared.plan);
      const started = controller.getSnapshot().active,
        current = client.getSnapshot();
      if (
        live.current &&
        started &&
        current.status === "authenticated" &&
        current.session.profile.id === source.userId
      )
        router.push({ pathname: "/workout/[id]", params: { id: started.draft.workoutId } });
    } catch (e) {
      if (live.current)
        setError(e instanceof Error ? e.message : "No pudimos iniciar la repetición.");
    } finally {
      inFlight.current = false;
      if (live.current) setBusy(false);
    }
  }
  return (
    <Page compact>
      <Action label="Volver al resultado" quiet disabled={busy} onPress={() => router.back()} />
      <ScreenIntro
        title="Repetir entrenamiento"
        description={plan ? `${plan.title} · ${day(plan.performedOn)}` : undefined}
      />
      {q.loading && !plan ? <Loading /> : null}
      {q.error ? <Notice message={q.error} retry={offline ? undefined : q.retry} /> : null}
      {error ? (
        <Notice
          message={error}
          retry={
            active
              ? undefined
              : () => {
                  setError(null);
                  setNeedsReview(false);
                  q.retry();
                }
          }
        />
      ) : null}
      {prepared && !prepared.ok ? <Notice message={prepared.message} /> : null}
      {plan ? (
        <>
          <Text style={[s.subheading, { color: p.ink }]}>
            {plan.exercises.length} ejercicios ·{" "}
            {plan.exercises.reduce((n, e) => n + e.sets.length, 0)} series
          </Text>
          <Text style={[s.caption, { color: p.muted }]}>
            Todas las series empezarán pendientes.
          </Text>
          {plan.warnings.map((w) => (
            <Text key={w} style={[s.caption, { color: p.muted }]}>
              {warnings[w]}
            </Text>
          ))}
          {blocks.map((block) => (
            <View key={block.id} style={{ gap: 12 }}>
              {block.supersetId ? (
                <Text style={[s.caption, { color: p.blue }]}>
                  {block.name} ·{" "}
                  {block.exercises[0].supersetRestSeconds == null
                    ? "descanso habitual"
                    : `${block.exercises[0].supersetRestSeconds} s`}
                </Text>
              ) : null}
              {block.exercises.map((e) => (
                <View key={e.sourcePosition} style={[s.divider, { borderColor: p.border, gap: 8 }]}>
                  <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
                    {e.name}
                  </Text>
                  {e.prescribed.recordType !== null ? (
                    <Text style={[s.caption, { color: p.muted }]}>
                      {RECORD_TYPE_LABELS[e.prescribed.recordType]}
                    </Text>
                  ) : null}
                  <Text style={[s.caption, { color: p.muted }]}>
                    Objetivo {e.prescribed.sets} × {targetLabel(e.prescribed.target)}
                  </Text>
                  {e.sets.slice(0, expanded === e.sourcePosition ? e.sets.length : 3).map((set) => (
                    <Text key={set.id} style={[s.body, { color: p.ink }]}>
                      {SET_TYPE_LABELS[set.setType]} {set.setNumber} ·{" "}
                      {formatTrainingMetrics(set.metrics)}
                    </Text>
                  ))}
                  {e.sets.length > 3 && expanded !== e.sourcePosition ? (
                    <Text style={[s.caption, { color: p.muted }]}>+{e.sets.length - 3} series</Text>
                  ) : null}
                  <Action
                    quiet
                    label={`${expanded === e.sourcePosition ? "Ocultar" : "Ver"} detalle de ${e.name}`}
                    onPress={() =>
                      setExpanded(expanded === e.sourcePosition ? null : e.sourcePosition)
                    }
                  />
                  {expanded === e.sourcePosition ? (
                    <>
                      {e.note ? <Text style={[s.body, { color: p.muted }]}>{e.note}</Text> : null}
                      {e.prescribed.series?.map((target, i) => (
                        <Text key={i} style={[s.caption, { color: p.muted }]}>
                          Objetivo {i + 1}: {targetLabel(target)}
                        </Text>
                      ))}
                      <Text style={[s.caption, { color: p.muted }]}>
                        Descanso {e.supersetId ? "de ronda" : "individual"}:{" "}
                        {(e.supersetId ? e.supersetRestSeconds : e.restSeconds) == null
                          ? "habitual"
                          : `${e.supersetId ? e.supersetRestSeconds : e.restSeconds} s`}
                      </Text>
                    </>
                  ) : null}
                </View>
              ))}
            </View>
          ))}
          <Action
            label="Empezar entrenamiento"
            busy={busy}
            disabled={
              busy ||
              q.loading ||
              !!q.error ||
              offline ||
              !training.ready ||
              training.blocked ||
              training.busy ||
              training.closing ||
              training.dirty ||
              needsReview ||
              !!active
            }
            onPress={() => {
              void begin();
            }}
          />
          <Text style={[s.caption, { color: p.muted }]}>
            Se iniciará un entrenamiento libre. Tu programa y el resultado anterior se conservan.
          </Text>
        </>
      ) : null}
      {active ? (
        <Action
          secondary
          label={
            active.draft.status === "pending_save"
              ? "Revisar entrenamiento pendiente"
              : "Retomar entrenamiento"
          }
          disabled={busy || training.busy || training.closing}
          onPress={() =>
            router.push({ pathname: "/workout/[id]", params: { id: active.draft.workoutId } })
          }
        />
      ) : null}
    </Page>
  );
}
