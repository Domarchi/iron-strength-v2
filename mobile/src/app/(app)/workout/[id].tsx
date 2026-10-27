import { WorkoutTools } from "../../../components/workout-tools";
import { useTrainingPreferences } from "../../../lib/training-preferences-context";
import { formatWeight } from "../../../../../src/domain/training-tools";
import { isTypedTraining } from "../../../lib/training";
import { TypedWorkout } from "../../../components/typed-workout";
import { useSession } from "../../../lib/session";
import { useWorkoutSyncQueue } from "../../../lib/sync-context";
import { QueuedWorkout } from "../../../components/queued-workout";
import { SyncQueueIssue } from "../../../components/sync-queue-card";
import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Icon } from "../../../components/icon";
import {
  Action,
  IconAction,
  Notice,
  Page,
  ScreenIntro,
  s,
  usePalette,
} from "../../../components/ui";
import { RestControls } from "../../../components/rest-controls";
import { DownloadedHistory } from "../../../components/downloaded-history";
import { WorkoutSets } from "../../../components/workout-sets";
import { useTraining } from "../../../lib/training-context";
import { summarize, workoutVolume } from "../../../../../src/lib/workout/runner-state";
import { substituteExercise } from "../../../../../src/lib/workout/substitution";
import { formatClock, remainingSeconds } from "../../../../../src/domain/rest-timer";
import { elapsedSessionSeconds } from "../../../../../src/domain/session-timer";
import { nextSupersetSet } from "../../../../../src/domain/superset-rounds";
function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now()),
      timer = setInterval(update, 1000),
      subscription = AppState.addEventListener("change", update);
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  return now;
}
export default function Workout() {
  const { preferences } = useTrainingPreferences();
  const [tools, setTools] = useState(false);
  const p = usePalette(),
    { id } = useLocalSearchParams<{ id: string }>(),
    { controller, training } = useTraining(),
    { state: session } = useSession(),
    syncQueue = useWorkoutSyncQueue(),
    now = useClock();
  const [error, setError] = useState<string | null>(null),
    [closing, setClosing] = useState(false),
    [discard, setDiscard] = useState(false),
    [details, showDetails] = useState<string | null>(null);
  const current = training.active;
  const a = current && !isTypedTraining(current) ? current : null,
    d = a?.draft,
    effort = a?.review?.effort ?? "",
    note = a?.review?.note ?? "";
  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos completar la acción.");
    }
  }
  function back() {
    router.navigate("/");
  }
  if (!training.ready)
    return (
      <Page>
        <Notice message="Recuperando tu entrenamiento…" />
      </Page>
    );
  if (current && isTypedTraining(current) && current.draft.workoutId === id)
    return <TypedWorkout active={current} />;
  if (!a || !d || d.workoutId !== id) return <QueuedWorkout id={id} />;
  const index = Math.min(a.activeIndex, d.exercises.length - 1),
    exercise = d.exercises[index],
    rx = a.routine.exercises[index],
    summary = summarize(d),
    volume = workoutVolume(d),
    pending = d.status === "pending_save",
    offline = session.status === "authenticated" && session.mode === "offline";
  const elapsed =
      d.durationSeconds ?? elapsedSessionSeconds(Date.parse(d.startedAt), now, a.pause ?? null),
    rest = d.rest ? remainingSeconds(d.rest, now) : 0,
    next = exercise?.supersetId ? nextSupersetSet(d.exercises, exercise.supersetId) : null;
  async function finish() {
    await act(async () => {
      const result = pending
        ? offline && a?.mode === "real"
          ? null
          : syncQueue.queue.verified && !syncQueue.queue.blocked
            ? await syncQueue.synchronize().then(() => null)
            : await controller.retry()
        : await controller.finish(effort.trim() ? Number(effort) : null, note.trim() || null, {
            localOnly: offline,
          });
      if (result && result.mode !== "pending")
        router.replace({
          pathname: "/result/[id]",
          params: { id: result.id, ...(result.mode === "demo" ? { demo: "1" } : {}) },
        });
    });
  }

  const personal = d.version === 3;
  const paused = !pending && a.pause?.pausedAtMs != null;
  const pauseControl = !pending ? (
    <IconAction
      label={paused ? "Reanudar entrenamiento" : "Pausar entrenamiento"}
      icon={paused ? "play" : "pause"}
      disabled={training.blocked || training.busy || training.closing || training.dirty}
      onPress={() => {
        if (!paused) Keyboard.dismiss();
        void act(() => (paused ? controller.resume() : controller.pause()));
      }}
    />
  ) : null;
  const addExercises = () =>
    router.push({ pathname: "/workout-add/[id]", params: { id: d!.workoutId } });
  if (!exercise)
    return (
      <Page compact>
        <Action label="Volver a Inicio" quiet onPress={back} />
        <ScreenIntro title={a.routine.session.title ?? "Entrenamiento"} />
        <View style={s.row}>
          <View style={{ gap: 4, flex: 1 }}>
            <Text style={[s.caption, { color: p.muted }]}>{paused ? "En pausa" : "Duración"}</Text>
            <Text
              accessibilityLabel="Duración del entrenamiento"
              style={[s.number, { color: p.ink }]}
            >
              {formatClock(elapsed)}
            </Text>
          </View>
          {pauseControl}
        </View>
        {training.error ? (
          <Notice
            message={training.error}
            retry={() => {
              void act(() => controller.retryStorage());
            }}
          />
        ) : null}
        {error ? <Notice message={error} /> : null}
        {personal ? (
          <Action
            label="Agregar ejercicios"
            icon="plus"
            disabled={
              paused ||
              offline ||
              training.blocked ||
              training.busy ||
              training.closing ||
              training.dirty
            }
            onPress={addExercises}
          />
        ) : null}
        {discard ? (
          <>
            <Notice message="¿Descartar este registro local?" />
            <Action
              label="Confirmar descarte"
              secondary
              onPress={() => {
                void act(async () => {
                  await controller.discard();
                  back();
                });
              }}
            />
            <Action label="Cancelar descarte" quiet onPress={() => setDiscard(false)} />
          </>
        ) : (
          <Action label="Descartar registro local" quiet onPress={() => setDiscard(true)} />
        )}
      </Page>
    );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: p.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Page compact>
        <View style={[s.row, { alignItems: "flex-start" }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.caption, { color: p.blue }]}>
              {a.mode === "demo" ? "DEMO · " : ""}
              {d.version === 3
                ? d.origin.kind === "free"
                  ? "LIBRE"
                  : "RUTINA PERSONAL"
                : `SESIÓN ${d.sessionLabel}`}
              {pending ? " · PENDIENTE DE ENVIAR" : ""}
            </Text>
            <Text style={[s.subheading, { color: p.ink }]}>
              {a.routine.session.title ?? `Sesión ${d.sessionLabel}`}
            </Text>
          </View>
          <View style={{ flexDirection: "row" }}>
            {pauseControl}
            <IconAction
              label="Volver a Inicio"
              icon="home"
              disabled={training.busy}
              onPress={back}
            />
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            gap: 16,
            borderBottomWidth: 0.5,
            borderBottomColor: p.border,
            paddingBottom: 12,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.caption, { color: p.muted }]}>{paused ? "En pausa" : "Duración"}</Text>
            <Text
              accessibilityLabel="Duración del entrenamiento"
              style={[s.number, { color: p.blue, fontSize: 17 }]}
            >
              {formatClock(elapsed)}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.caption, { color: p.muted }]}>Volumen</Text>
            <Text style={[s.number, { color: p.ink, fontSize: 17 }]}>
              {formatWeight(volume.loadKg, preferences.value.weightUnit)}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.caption, { color: p.muted }]}>Series</Text>
            <Text style={[s.number, { color: p.ink, fontSize: 17 }]}>
              {summary.doneSets}/{summary.totalSets}
            </Text>
          </View>
        </View>
        <View style={{ gap: 4 }}>
          <Text
            accessibilityLiveRegion="polite"
            style={[s.caption, { color: training.error ? p.danger : p.muted }]}
          >
            {training.dirty
              ? "Cambios pendientes de guardar en este dispositivo"
              : pending
                ? "Guardado en este dispositivo · pendiente de enviar"
                : "Guardado en este dispositivo"}
          </Text>
          {a.mode === "demo" ? (
            <Text style={[s.caption, { color: p.blue }]}>PRUEBA LOCAL · No se envía al coach</Text>
          ) : null}
        </View>
        {training.error ? (
          <Notice
            message={training.error}
            retry={() => {
              void act(() => controller.retryStorage());
            }}
          />
        ) : null}
        {error ? <Notice message={error} /> : null}
        {pending ? (
          <View style={[s.card, { backgroundColor: p.tint, borderColor: p.blue }]}>
            <SyncQueueIssue />
            <Text style={[s.subheading, { color: p.ink }]}>
              {training.dirty
                ? training.error
                  ? "Guardado local sin confirmar"
                  : "Confirmando el guardado local…"
                : "Tu registro está protegido"}
            </Text>
            <Text style={[s.body, { color: p.muted }]}>
              {summary.doneSets} series completadas.{" "}
              {training.dirty
                ? "Comprueba el almacenamiento antes de enviar; el guardado local aún no está confirmado."
                : a.mode === "demo"
                  ? "Guarda el resumen de esta prueba en el dispositivo."
                  : offline
                    ? "Tu registro quedó en este dispositivo. Conecta para confirmar el envío sin duplicarlo."
                    : "Reintenta el envío sin duplicar el entrenamiento. El coach podrá verlo después de la confirmación del servidor."}
            </Text>
            <Action
              label={a.mode === "demo" ? "Guardar resumen demo" : "Reintentar envío"}
              disabled={
                training.dirty ||
                syncQueue.transferring ||
                syncQueue.syncing ||
                (offline && a.mode === "real")
              }
              busy={training.busy || training.closing}
              onPress={() => {
                void finish();
              }}
            />
          </View>
        ) : (
          <>
            {personal ? (
              <Action
                label="Organizar ejercicios"
                quiet
                disabled={
                  paused || training.dirty || training.blocked || training.busy || training.closing
                }
                onPress={() => {
                  Keyboard.dismiss();
                  router.push({ pathname: "/workout-organize/[id]", params: { id: d.workoutId } });
                }}
              />
            ) : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
              style={{ flexGrow: 0 }}
            >
              {d.exercises.map((ex, i) => (
                <Pressable
                  key={ex.sessionExerciseId}
                  accessibilityRole="button"
                  accessibilityLabel={`Ir a ${ex.name}${d.exercises.filter((row) => row.name === ex.name).length > 1 ? `, ejercicio ${i + 1}` : ""}`}
                  accessibilityState={{ selected: i === index }}
                  aria-pressed={i === index}
                  onPress={() => {
                    void act(() => controller.focus(i));
                  }}
                  style={{
                    minHeight: 48,
                    width: 156,
                    borderRadius: 8,
                    borderWidth: 0.5,
                    borderColor: i === index ? p.blue : p.border,
                    backgroundColor: i === index ? p.tint : p.card,
                    padding: 8,
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <Text style={[s.caption, { color: p.blue }]}>{i + 1}</Text>
                  <Text numberOfLines={2} style={[s.label, { color: p.ink, flex: 1 }]}>
                    {ex.name}
                    {ex.supersetId ? " · Superserie" : ""}
                  </Text>
                  <Text style={[s.caption, { color: p.muted }]}>
                    {ex.sets.filter((x) => x.done).length}/{ex.sets.length}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ gap: 16 }}>
              {exercise.supersetId ? (
                <Text style={[s.caption, { color: p.blue }]}>
                  SUPERSERIE ·{" "}
                  {next
                    ? `Ronda ${next.round + 1} · sigue ${d.exercises[next.exerciseIndex].name}`
                    : "Todas las rondas completadas"}
                </Text>
              ) : null}
              <View style={{ gap: 4 }}>
                <Text style={[s.subheading, { color: p.blue }]}>{exercise.name}</Text>
                <Text style={[s.caption, { color: p.blue }]}>
                  {exercise.supersetId
                    ? `Descanso al terminar la ronda: ${exercise.supersetRestSeconds ?? 90} s`
                    : `Descanso entre series: ${exercise.restSeconds ?? 90} s`}
                </Text>
              </View>
              <Action
                label="Herramientas del ejercicio"
                quiet
                disabled={
                  paused || training.dirty || training.busy || training.closing || training.blocked
                }
                onPress={() => setTools((v) => !v)}
              />
              {tools ? (
                <WorkoutTools
                  key={`${d.workoutId}:${exercise.sessionExerciseId}:${exercise.exerciseId}`}
                  active={a}
                  index={index}
                  onClose={() => setTools(false)}
                />
              ) : null}
              <WorkoutSets
                index={index}
                onComplete={(si) => {
                  setError(null);
                  return controller.complete(index, si);
                }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  personal ? "Detalles del ejercicio" : "Indicaciones y alternativas"
                }
                accessibilityState={{ expanded: details === exercise.sessionExerciseId }}
                aria-expanded={details === exercise.sessionExerciseId}
                onPress={() =>
                  showDetails((current) =>
                    current === exercise.sessionExerciseId ? null : exercise.sessionExerciseId,
                  )
                }
                style={({ pressed }) => ({
                  minHeight: 48,
                  paddingVertical: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  borderTopWidth: 1,
                  borderTopColor: p.border,
                  backgroundColor: pressed ? p.raised : "transparent",
                })}
              >
                <Text style={[s.label, { color: p.blue, flex: 1 }]}>
                  {personal ? "Detalles del ejercicio" : "Indicaciones y alternativas"}
                </Text>
                <Icon
                  name={details === exercise.sessionExerciseId ? "minus" : "plus"}
                  color={p.blue}
                  size={18}
                />
              </Pressable>
              {details === exercise.sessionExerciseId ? (
                <View style={{ gap: 12 }}>
                  {a.mode === "real" && !pending ? (
                    <Action
                      label="Añadir esfuerzo por serie y notas"
                      quiet
                      disabled={training.dirty || training.busy || training.closing}
                      onPress={() => {
                        void act(() => controller.upgradeRecording());
                      }}
                    />
                  ) : null}
                  {a.mode === "real" ? (
                    <DownloadedHistory exerciseId={exercise.exerciseId} personal={personal} />
                  ) : null}
                  {rx.note ? (
                    <Text style={[s.body, { color: p.muted }]}>{rx.note}</Text>
                  ) : !personal ? (
                    <Text style={[s.caption, { color: p.muted }]}>
                      Sin indicaciones adicionales del coach.
                    </Text>
                  ) : null}
                  {exercise.alternatives?.length ? (
                    <>
                      <Text style={[s.label, { color: p.ink }]}>Alternativas autorizadas</Text>
                      <Text style={[s.body, { color: p.muted }]}>
                        Elige antes de completar series de este ejercicio.
                      </Text>
                      {[exercise.original, ...exercise.alternatives]
                        .filter((c) => c && c.exerciseId !== exercise.exerciseId)
                        .map((choice) => (
                          <Action
                            key={choice!.exerciseId}
                            label={`Cambiar a ${choice!.name}`}
                            secondary
                            disabled={paused || exercise.sets.some((x) => x.done)}
                            onPress={() =>
                              controller.edit((draft) =>
                                substituteExercise(draft, index, choice!.exerciseId),
                              )
                            }
                          />
                        ))}
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
            {index < d.exercises.length - 1 ? (
              <Action
                label="Siguiente ejercicio"
                secondary
                onPress={() => {
                  void act(() => controller.focus(index + 1));
                }}
              />
            ) : null}
            {closing ? (
              <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
                <Text style={[s.subheading, { color: p.ink }]}>Revisa antes de terminar</Text>
                <Text style={[s.caption, { color: p.muted }]}>
                  {formatWeight(volume.loadKg, preferences.value.weightUnit)} de volumen registrado
                </Text>
                <Text style={[s.body, { color: p.muted }]}>
                  {summary.doneSets} series realizadas · {summary.totalSets - summary.doneSets}{" "}
                  pendientes. Se guardarán solo las series completadas.
                </Text>
                <Text style={[s.label, { color: p.ink }]}>Esfuerzo de 1 a 10 · opcional</Text>
                <TextInput
                  keyboardAppearance={p.dark ? "dark" : "light"}
                  selectionColor={p.blue}
                  accessibilityLabel="Esfuerzo percibido"
                  editable={!training.busy && !training.closing}
                  keyboardType="number-pad"
                  value={effort}
                  maxLength={2}
                  onChangeText={(value) => controller.review(value, note)}
                  style={[s.input, { color: p.ink, borderColor: p.border }]}
                />
                <Text style={[s.label, { color: p.ink }]}>¿Cómo te fue? · opcional</Text>
                <TextInput
                  keyboardAppearance={p.dark ? "dark" : "light"}
                  selectionColor={p.blue}
                  accessibilityLabel="Nota del entrenamiento"
                  editable={!training.busy && !training.closing}
                  multiline
                  maxLength={500}
                  value={note}
                  onChangeText={(value) => controller.review(effort, value)}
                  style={[
                    s.input,
                    {
                      color: p.ink,
                      borderColor: p.border,
                      minHeight: 90,
                      textAlignVertical: "top",
                    },
                  ]}
                />
                <Action
                  label={
                    a.mode === "demo"
                      ? "Guardar demo"
                      : offline
                        ? "Guardar en este dispositivo"
                        : "Guardar entrenamiento"
                  }
                  busy={training.busy || training.closing}
                  disabled={summary.doneSets === 0 || training.dirty}
                  onPress={() => {
                    void finish();
                  }}
                />
                <Action label="Seguir entrenando" secondary onPress={() => setClosing(false)} />
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {personal ? (
                  <Action
                    label="Agregar ejercicios"
                    secondary
                    disabled={
                      paused ||
                      offline ||
                      training.blocked ||
                      training.busy ||
                      training.closing ||
                      d.exercises.length >= 15
                    }
                    onPress={addExercises}
                  />
                ) : null}
                <Action
                  label="Finalizar entrenamiento"
                  disabled={summary.doneSets === 0 || training.dirty}
                  onPress={() => setClosing(true)}
                />
              </View>
            )}
          </>
        )}
        {discard ? (
          <>
            <Notice message="¿Descartar este registro local? Las series pendientes se perderán. Los datos que ya estén en el servidor se conservan." />
            <Action
              label="Confirmar descarte"
              secondary
              disabled={training.busy || training.closing || (pending && syncQueue.transferring)}
              onPress={() => {
                void act(async () => {
                  if (pending) await syncQueue.discard(d.workoutId);
                  else await controller.discard();
                  back();
                });
              }}
            />
            <Action label="Cancelar descarte" secondary onPress={() => setDiscard(false)} />
          </>
        ) : (
          <Action
            label="Descartar registro local"
            quiet
            disabled={training.busy || training.closing || (pending && syncQueue.transferring)}
            onPress={() => setDiscard(true)}
          />
        )}
      </Page>
      {rest > 0 && !pending ? (
        <RestControls
          seconds={rest}
          totalSeconds={d.rest?.totalSeconds ?? rest}
          onAdjust={(delta) => void act(() => controller.changeRest(delta))}
          onSkip={() => {
            void act(() => controller.changeRest(null));
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}
