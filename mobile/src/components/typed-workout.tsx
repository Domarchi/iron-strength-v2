import { WorkoutHeading } from "./workout-heading";
import { WorkoutPanel } from "./workout-panel";
import { useTrainingDownload } from "../lib/training-download-context";
import { TrainingExerciseHistory } from "./training-exercise-history";
import { WorkoutTools } from "./workout-tools";
import { isSuggestedWeight } from "../lib/suggested-value";
import { QuickAdjust, adjustWeightText } from "./quick-adjust";
import { EffortChips } from "./effort-chips";
import { useTrainingPreferences } from "../lib/training-preferences-context";
import { trainingFields } from "../lib/training-fields";
import { formatWeight, formatDistance } from "../../../src/domain/training-tools";
import { useCallback, useEffect, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useTraining } from "../lib/training-context";
import type { TypedActiveTraining } from "../lib/training";
import { useSession } from "../lib/session";
import { useWorkoutSyncQueue } from "../lib/sync-context";
import {
  editTypedSet,
  setTypedSetType,
  typedSetTarget,
  chooseTypedAlternative,
  previousTypedSet,
  copyTypedSetPerformance,
} from "../lib/typed-training";
import {
  trainingTotals,
  formatPresentedTrainingMetrics as formatTrainingMetrics,
} from "../../../src/domain/training-metrics";
import { parseTrainingSetInput } from "../../../src/domain/training-input";
import { remainingSeconds } from "../../../src/domain/rest-timer";
import { nextSupersetSet } from "../../../src/domain/superset-rounds";
import { elapsedSessionSeconds } from "../../../src/domain/session-timer";
import { Action, IconAction, Input, Notice, Page, s, usePalette } from "./ui";
import { RestControls } from "./rest-controls";
import { SetCheck } from "./set-check";
import { formatTrainingTarget } from "../lib/training-labels";
const classes = {
  working: "Trabajo",
  warmup: "Calentamiento",
  failure: "Al fallo",
  drop: "Descendente",
} as const;
export function TypedWorkout({ active: a }: { active: TypedActiveTraining }) {
  const { preferences } = useTrainingPreferences();
  const { width, fontScale } = useWindowDimensions();
  const previousColumn = preferences.value.showPrevious && width >= 360 && fontScale <= 1.15;
  const [tools, setTools] = useState(false);
  const p = usePalette(),
    { controller, training } = useTraining(),
    { state } = useSession(),
    { bundle } = useTrainingDownload(),
    sync = useWorkoutSyncQueue();
  const [now, setNow] = useState(() => Date.now()),
    [error, setError] = useState<string | null>(null),
    [options, setOptions] = useState<string | null>(null),
    [details, setDetails] = useState(false),
    [closing, setClosing] = useState(false),
    [discard, setDiscard] = useState(false);
  useEffect(() => {
    const update = () => setNow(Date.now()),
      timer = setInterval(update, 1000),
      listener = AppState.addEventListener("change", update);
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, []);
  useFocusEffect(
    useCallback(
      () => () => {
        setTools(false);
        setDetails(false);
        setClosing(false);
      },
      [],
    ),
  );
  const d = a.draft,
    index = Math.max(0, Math.min(a.activeIndex, d.exercises.length - 1)),
    exercise = d.exercises[index],
    source = a.routine.exercises[index];
  const previousSets =
    a.routine.version === 5
      ? (a.routine.previousSets.find(
          (r) =>
            r.exerciseId === exercise?.exerciseId &&
            r.recordType === exercise?.prescribed.recordType,
        )?.sets ?? [])
      : [];
  const pending = d.status === "pending_save",
    paused = !pending && a.pause?.pausedAtMs != null,
    offline = state.status === "authenticated" && state.mode === "offline";
  const locked = pending || paused || training.busy || training.closing || training.blocked;
  const rest = d.rest ? remainingSeconds(d.rest, now) : 0;
  const elapsed =
    d.durationSeconds ?? elapsedSessionSeconds(Date.parse(d.startedAt), now, a.pause ?? null);
  const done = d.exercises.reduce(
      (n, e) => n + e.sets.filter((s) => s.done && !e.skipped).length,
      0,
    ),
    total = d.exercises.reduce((n, e) => n + (e.skipped ? 0 : e.sets.length), 0);
  const actual = d.exercises.flatMap((e) =>
    e.skipped
      ? []
      : e.sets
          .filter((s) => s.done)
          .flatMap((s) => {
            const m = parseTrainingSetInput(e.prescribed.recordType, s);
            return m ? [m] : [];
          }),
  );
  const totals = trainingTotals(actual),
    next = exercise?.supersetId
      ? nextSupersetSet(
          d.exercises.map((e) => ({
            ...e,
            sets: e.sets.map((s) => ({ done: s.done, isWarmup: s.setType === "warmup" })),
          })),
          exercise.supersetId,
        )
      : null;
  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos completar la acción.");
    }
  }
  const update = (fn: Parameters<typeof controller.editTyped>[0]) => {
    setError(null);
    try {
      controller.editTyped(fn);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisa los datos.");
    }
  };
  async function finish() {
    await act(async () => {
      const result = pending
        ? await controller.retry()
        : await controller.finish(
            a.review?.effort.trim() ? Number(a.review.effort) : null,
            a.review?.note.trim() || null,
            { localOnly: offline },
          );
      if (result && result.mode !== "pending")
        router.replace({ pathname: "/result/[id]", params: { id: result.id } });
    });
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: p.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Page compact>
        <WorkoutHeading
          paused={paused}
          title={a.routine.title ?? `Sesión ${d.sessionLabel}`}
          elapsed={elapsed}
          done={done}
          total={total}
          onBack={() => router.navigate("/")}
          backDisabled={training.busy}
          onFinish={
            pending
              ? undefined
              : () => {
                  setDetails(false);
                  setTools(false);
                  setClosing(true);
                }
          }
          finishDisabled={locked || training.dirty}
          pause={
            !pending ? (
              <IconAction
                label={paused ? "Reanudar entrenamiento" : "Pausar entrenamiento"}
                icon={paused ? "play" : "pause"}
                disabled={training.dirty || training.busy || training.closing || training.blocked}
                onPress={() => {
                  void act(() => (paused ? controller.resume() : controller.pause()));
                }}
              />
            ) : null
          }
        />
        <Text style={[s.caption, { color: training.dirty ? p.muted : p.success }]}>
          {training.dirty ? "Cambios pendientes" : "Guardado en este dispositivo"}
        </Text>
        {training.error && !tools && !details && (!closing || pending) ? (
          <Notice
            message={training.error}
            retry={() => {
              void act(() => controller.retryStorage());
            }}
          />
        ) : null}
        {error && !tools && !details && (!closing || pending) ? <Notice message={error} /> : null}
        {paused ? <Notice message="Entrenamiento en pausa. Reanuda para continuar." /> : null}
        {pending ? (
          <Notice message="Guardado en este dispositivo. Pendiente de confirmar por el servidor." />
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: 8 }}
        >
          {d.exercises.map((e, i) => (
            <Pressable
              key={e.sessionExerciseId}
              accessibilityRole="button"
              accessibilityLabel={`Ir a ${e.name}`}
              accessibilityState={{ selected: index === i }}
              aria-pressed={index === i}
              onPress={() => {
                setTools(false);
                setDetails(false);
                setOptions(null);
                void act(() => controller.focus(i));
              }}
              style={{
                width: 156,
                minHeight: 48,
                borderRadius: 8,
                borderWidth: 0.5,
                borderColor: index === i ? p.blue : p.border,
                backgroundColor: index === i ? p.tint : p.card,
                padding: 8,
                flexDirection: "row",
                gap: 6,
                alignItems: "center",
              }}
            >
              <Text style={[s.caption, { color: p.blue }]}>{i + 1}</Text>
              <Text numberOfLines={2} style={[s.label, { color: p.ink, flex: 1 }]}>
                {e.name}
              </Text>
              <Text style={[s.caption, { color: p.muted }]}>
                {e.sets.filter((s) => s.done).length}/{e.sets.length}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {exercise ? (
          <>
            <Text style={[s.subheading, { color: p.blue }]}>{exercise.name}</Text>
            {exercise.supersetId ? (
              <Text style={[s.caption, { color: p.muted }]}>
                {next
                  ? `Ronda ${next.round + 1} · sigue ${d.exercises[next.exerciseIndex].name}`
                  : "Todas las rondas completadas"}
              </Text>
            ) : null}
            {preferences.value.showPrevious && exercise.lastMetrics ? (
              <Text style={[s.caption, { color: p.muted }]}>
                Anterior · {formatTrainingMetrics(exercise.lastMetrics, preferences.value)}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
              <Text
                style={[
                  s.caption,
                  { width: 44, textAlign: "center", color: p.muted, fontSize: 11 },
                ]}
              >
                SERIE
              </Text>
              {previousColumn ? (
                <Text
                  style={[
                    s.caption,
                    { width: 72, textAlign: "center", color: p.muted, fontSize: 11 },
                  ]}
                >
                  ANTERIOR
                </Text>
              ) : null}
              {trainingFields(exercise.prescribed.recordType).map((f) => (
                <Text
                  key={f.field}
                  style={[
                    s.caption,
                    { flex: 1, textAlign: "center", color: p.muted, fontSize: 11 },
                  ]}
                >
                  {f.label}
                </Text>
              ))}
              <View style={{ width: 48 }} />
            </View>
            {exercise.sets.map((set, si) => {
              const target = typedSetTarget(exercise, si),
                previous = previousTypedSet(exercise, si, previousSets);
              const previousValue = previous ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Copiar anterior a serie ${si + 1}`}
                  accessibilityState={{ disabled: locked || set.done }}
                  disabled={locked || set.done}
                  onPress={() =>
                    update((draft) => copyTypedSetPerformance(draft, index, si, previousSets))
                  }
                  style={({ pressed }) => ({
                    width: previousColumn ? 72 : undefined,
                    minHeight: 48,
                    justifyContent: "center",
                    alignItems: previousColumn ? "center" : "flex-start",
                    borderRadius: 6,
                    backgroundColor: pressed ? p.raised : "transparent",
                  })}
                >
                  <Text
                    style={[
                      s.caption,
                      s.number,
                      {
                        color: p.muted,
                        fontSize: 12,
                        textAlign: previousColumn ? "center" : "left",
                      },
                    ]}
                  >
                    {previousColumn ? "" : "Anterior · "}
                    {formatTrainingMetrics(
                      {
                        recordType: previous.recordType,
                        weightKg: previous.weightKg,
                        reps: previous.reps,
                        durationSeconds: previous.durationSeconds,
                        distanceMeters: previous.distanceMeters,
                      },
                      preferences.value,
                    )}
                  </Text>
                </Pressable>
              ) : previousColumn ? (
                <Text
                  accessibilityLabel={`Sin referencia anterior para serie ${si + 1}`}
                  style={[s.caption, { width: 72, textAlign: "center", color: p.muted }]}
                >
                  —
                </Text>
              ) : null;
              return (
                <View
                  key={set.id}
                  style={{
                    gap: 4,
                    paddingVertical: 4,
                    borderBottomWidth: 0.5,
                    borderColor: p.border,
                    backgroundColor: "transparent",
                    borderRadius: 6,
                  }}
                >
                  {target && preferences.value.showTargets ? (
                    <Text style={[s.caption, { color: p.muted }]}>
                      {formatTrainingTarget(target, preferences.value)}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Opciones de serie ${si + 1}`}
                      accessibilityState={{ expanded: options === set.id, disabled: locked }}
                      disabled={locked}
                      onPress={() => setOptions((v) => (v === set.id ? null : set.id))}
                      style={{
                        minWidth: 44,
                        minHeight: 48,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={[s.label, { color: p.blue }]}>
                        {set.setType === "working"
                          ? si + 1
                          : set.setType === "warmup"
                            ? "W"
                            : set.setType === "failure"
                              ? "F"
                              : "D"}
                      </Text>
                    </Pressable>
                    {previousColumn ? previousValue : null}
                    {trainingFields(exercise.prescribed.recordType).map((f) => (
                      <View key={f.field} style={{ flex: 1, gap: 2 }}>
                        <Input
                          accessibilityLabel={`${f.label} serie ${si + 1}`}
                          keyboardType={f.integer ? "number-pad" : "decimal-pad"}
                          keyboardAppearance={p.dark ? "dark" : "light"}
                          selectionColor={p.blue}
                          editable={!locked}
                          value={set[f.field]}
                          onChangeText={(value) =>
                            update((draft) => editTypedSet(draft, index, si, f.field, value))
                          }
                          style={[
                            s.input,
                            s.number,
                            {
                              color:
                                f.field === "weight" &&
                                isSuggestedWeight(set.weight, target?.targetWeightKg, set.done)
                                  ? p.muted
                                  : p.ink,
                              borderColor: set.done ? p.completed : p.control,
                              backgroundColor: set.done ? p.completed : p.field,
                              textAlign: "center",
                              paddingHorizontal: 4,
                              paddingVertical: 4,
                              minHeight: 48,
                            },
                          ]}
                        />
                        {f.field === "weight" &&
                        preferences.value.weightUnit !== "kg" &&
                        /^\d+(?:[.,]\d+)?$/.test(set.weight) ? (
                          <Text style={[s.caption, { color: p.muted, textAlign: "center" }]}>
                            ≈{" "}
                            {formatWeight(
                              Number(set.weight.replace(",", ".")),
                              preferences.value.weightUnit,
                            )}
                          </Text>
                        ) : null}
                        {f.field === "distance" &&
                        preferences.value.distanceUnit !== "m" &&
                        /^\d+(?:[.,]\d+)?$/.test(set.distance) ? (
                          <Text style={[s.caption, { color: p.muted, textAlign: "center" }]}>
                            ≈{" "}
                            {formatDistance(
                              Number(set.distance.replace(",", ".")),
                              preferences.value.distanceUnit,
                            )}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                    <SetCheck
                      number={si + 1}
                      checked={set.done}
                      disabled={locked}
                      onPress={() => {
                        void act(async () => {
                          try {
                            await controller.complete(index, si);
                          } catch (error) {
                            throw Error(
                              `Serie ${si + 1}: ${error instanceof Error ? error.message : "Revisa los valores."}`,
                            );
                          }
                        });
                      }}
                    />
                  </View>
                  {si === exercise.sets.findIndex((x) => !x.done) &&
                  !locked &&
                  trainingFields(exercise.prescribed.recordType).some(
                    (f) => f.field === "weight",
                  ) ? (
                    <QuickAdjust
                      setNumber={si + 1}
                      step={2.5}
                      unitLabel="kg"
                      disabled={locked}
                      onAdjust={(delta) =>
                        update((draft) =>
                          editTypedSet(
                            draft,
                            index,
                            si,
                            "weight",
                            adjustWeightText(set.weight, delta, target?.targetWeightKg ?? null),
                          ),
                        )
                      }
                    />
                  ) : null}
                  {preferences.value.showPrevious && !previousColumn ? previousValue : null}
                  {options === set.id ? (
                    <View style={{ gap: 8, padding: 8 }}>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                        {(Object.keys(classes) as (keyof typeof classes)[]).map((kind) => (
                          <Action
                            key={kind}
                            label={classes[kind]}
                            quiet={kind !== set.setType}
                            secondary={kind === set.setType}
                            disabled={locked}
                            onPress={() =>
                              update((draft) => setTypedSetType(draft, index, si, kind))
                            }
                          />
                        ))}
                      </View>
                      <Text style={[s.caption, { color: p.muted }]}>Esfuerzo · 1–10, opcional</Text>
                      <Input
                        accessibilityLabel={`Esfuerzo de serie ${si + 1}`}
                        keyboardType="decimal-pad"
                        keyboardAppearance={p.dark ? "dark" : "light"}
                        selectionColor={p.blue}
                        editable={!locked}
                        value={set.effort}
                        onChangeText={(value) =>
                          update((draft) => editTypedSet(draft, index, si, "effort", value))
                        }
                        style={[s.input, { color: p.ink, borderColor: p.control }]}
                      />
                      <Action
                        label={`Quitar serie ${si + 1}`}
                        quiet
                        disabled={locked || exercise.sets.length <= 1}
                        onPress={() =>
                          update((draft) => ({
                            ...draft,
                            exercises: draft.exercises.map((e, i) =>
                              i === index ? { ...e, sets: e.sets.filter((_, j) => j !== si) } : e,
                            ),
                          }))
                        }
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
            <Action
              label="Agregar serie"
              quiet
              disabled={locked || exercise.sets.length >= 20}
              onPress={() =>
                update((draft) => ({
                  ...draft,
                  exercises: draft.exercises.map((e, i) =>
                    i === index
                      ? {
                          ...e,
                          sets: [
                            ...e.sets,
                            {
                              ...e.sets.at(-1)!,
                              id: `${e.sessionExerciseId}-${e.sets.length}-${Date.now()}`,
                              done: false,
                              effort: "",
                            },
                          ],
                        }
                      : e,
                  ),
                }))
              }
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {!pending ? (
                <View style={{ flexGrow: 1 }}>
                  <Action
                    label="Herramientas"
                    accessibilityLabel="Herramientas del ejercicio"
                    quiet
                    disabled={locked || training.dirty}
                    onPress={() => {
                      setDetails(false);
                      setTools(true);
                    }}
                  />
                </View>
              ) : null}
              <View style={{ flexGrow: 1 }}>
                <Action
                  label="Detalles"
                  accessibilityLabel="Detalles del ejercicio"
                  quiet
                  onPress={() => {
                    setTools(false);
                    setDetails(true);
                  }}
                />
              </View>
            </View>
            {tools ? (
              <WorkoutPanel title="Herramientas del ejercicio" onClose={() => setTools(false)}>
                {training.error ? (
                  <Notice
                    message={training.error}
                    retry={() => {
                      void act(() => controller.retryStorage());
                    }}
                  />
                ) : null}
                {error ? <Notice message={error} /> : null}
                <WorkoutTools
                  key={`${d.workoutId}:${exercise.sessionExerciseId}:${exercise.exerciseId}`}
                  active={a}
                  index={index}
                  onClose={() => setTools(false)}
                />
              </WorkoutPanel>
            ) : null}
            {details ? (
              <WorkoutPanel title="Detalles del ejercicio" onClose={() => setDetails(false)}>
                {training.error ? (
                  <Notice
                    message={training.error}
                    retry={() => {
                      void act(() => controller.retryStorage());
                    }}
                  />
                ) : null}
                {error ? <Notice message={error} /> : null}
                <TrainingExerciseHistory
                  key={exercise.exerciseId}
                  exerciseId={exercise.exerciseId}
                />
                {source.note ? (
                  <Text style={[s.body, { color: p.muted }]}>{source.note}</Text>
                ) : null}
                <Text style={[s.label, { color: p.ink }]}>Tu nota · opcional</Text>
                <Input
                  accessibilityLabel="Nota del ejercicio"
                  multiline
                  editable={!locked}
                  keyboardAppearance={p.dark ? "dark" : "light"}
                  selectionColor={p.blue}
                  value={exercise.athleteNote ?? ""}
                  onChangeText={(value) =>
                    update((draft) => ({
                      ...draft,
                      exercises: draft.exercises.map((e, i) =>
                        i === index
                          ? { ...e, athleteNote: Array.from(value).slice(0, 500).join("") }
                          : e,
                      ),
                    }))
                  }
                  style={[s.input, { color: p.ink, borderColor: p.control }]}
                />
                <Text style={[s.caption, { color: p.muted }]}>
                  {exercise.supersetId ? "Descanso por ronda" : "Descanso entre series"}:{" "}
                  {(exercise.supersetId ? exercise.supersetRestSeconds : exercise.restSeconds) ??
                    90}{" "}
                  s
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {[0, 60, 90, 120].map((seconds) => (
                    <Action
                      key={seconds}
                      label={`${seconds} s`}
                      quiet
                      disabled={locked}
                      onPress={() =>
                        update((draft) => ({
                          ...draft,
                          exercises: draft.exercises.map((e, i) =>
                            (
                              exercise.supersetId
                                ? e.supersetId === exercise.supersetId
                                : i === index
                            )
                              ? {
                                  ...e,
                                  ...(exercise.supersetId
                                    ? { supersetRestSeconds: seconds }
                                    : { restSeconds: seconds }),
                                }
                              : e,
                          ),
                        }))
                      }
                    />
                  ))}
                </View>
                {a.routine.origin.kind === "assigned"
                  ? [source, ...source.alternatives]
                      .filter((c) => c.exerciseId !== exercise.exerciseId)
                      .map((c) => (
                        <Action
                          key={c.exerciseId}
                          label={`Cambiar a ${c.name}`}
                          secondary
                          disabled={locked || exercise.sets.some((s) => s.done)}
                          onPress={() =>
                            update((draft) =>
                              chooseTypedAlternative(a.routine, draft, index, c.exerciseId),
                            )
                          }
                        />
                      ))
                  : null}
              </WorkoutPanel>
            ) : null}
          </>
        ) : (
          <Text style={[s.body, { color: p.muted }]}>
            Agrega ejercicios para empezar tu registro.
          </Text>
        )}
        {!pending && a.routine.origin.kind !== "assigned" ? (
          <View style={{ gap: 8 }}>
            <Action
              label="Agregar ejercicios"
              secondary
              disabled={locked || (offline && !bundle) || training.dirty}
              onPress={() =>
                router.push({ pathname: "/workout-add/[id]", params: { id: d.workoutId } })
              }
            />
            <Action
              label="Organizar ejercicios"
              quiet
              disabled={locked || training.dirty}
              onPress={() =>
                router.push({ pathname: "/workout-organize/[id]", params: { id: d.workoutId } })
              }
            />
          </View>
        ) : null}
        {closing && !pending ? (
          <WorkoutPanel
            title="Revisa antes de terminar"
            onClose={() => setClosing(false)}
            dismissible={!training.closing && !training.busy}
          >
            {training.error ? (
              <Notice
                message={training.error}
                retry={() => {
                  void act(() => controller.retryStorage());
                }}
              />
            ) : null}
            {error ? <Notice message={error} /> : null}
            <Text style={[s.body, { color: p.muted }]}>
              {done} {done === 1 ? "serie realizada" : "series realizadas"} · {total - done}{" "}
              {total - done === 1 ? "pendiente" : "pendientes"}
            </Text>
            <Text style={[s.caption, { color: p.muted }]}>
              {[
                `${formatWeight(totals.externalVolumeKg, preferences.value.weightUnit)} de volumen`,
                totals.durationSeconds > 0 ? `${totals.durationSeconds} s registrados` : null,
                totals.distanceMeters > 0
                  ? formatDistance(totals.distanceMeters, preferences.value.distanceUnit)
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <EffortChips
              value={a.review?.effort ?? ""}
              disabled={training.closing}
              onChange={(v) => controller.review(v, a.review?.note ?? "")}
            />
            <Input
              accessibilityLabel="Esfuerzo percibido"
              placeholder="Esfuerzo 1–10 · opcional"
              placeholderTextColor={p.muted}
              keyboardType="number-pad"
              editable={!training.closing}
              value={a.review?.effort ?? ""}
              onChangeText={(v) => controller.review(v, a.review?.note ?? "")}
              style={[s.input, { color: p.ink, borderColor: p.control }]}
            />
            <Input
              accessibilityLabel="Nota del entrenamiento"
              placeholder="Nota opcional"
              placeholderTextColor={p.muted}
              multiline
              editable={!training.closing}
              value={a.review?.note ?? ""}
              onChangeText={(v) => controller.review(a.review?.effort ?? "", v)}
              style={[s.input, { color: p.ink, borderColor: p.control }]}
            />
            <Action
              label={offline ? "Guardar en este dispositivo" : "Confirmar y guardar"}
              busy={training.closing || training.busy}
              onPress={() => {
                void finish();
              }}
            />
            <Action
              label="Seguir entrenando"
              quiet
              disabled={training.closing || training.busy}
              onPress={() => setClosing(false)}
            />
          </WorkoutPanel>
        ) : pending ? (
          <Action
            label="Reintentar envío"
            disabled={offline || sync.syncing || training.dirty}
            busy={training.busy}
            onPress={() => {
              void act(() => sync.synchronize());
            }}
          />
        ) : null}
        {discard ? (
          <>
            <Notice message="Se eliminará solo este registro local. Esta acción no borra resultados del servidor." />
            <Action
              label="Confirmar descarte"
              secondary
              disabled={training.busy || training.closing}
              onPress={() => {
                void act(async () => {
                  await controller.discard();
                  router.navigate("/");
                });
              }}
            />
            <Action label="Conservar registro" quiet onPress={() => setDiscard(false)} />
          </>
        ) : (
          <Action
            label="Descartar registro local"
            danger
            quiet
            disabled={training.busy || training.closing}
            onPress={() => setDiscard(true)}
          />
        )}
      </Page>
      {rest > 0 && !pending ? (
        <RestControls
          seconds={rest}
          totalSeconds={d.rest?.totalSeconds ?? 90}
          onAdjust={(delta) => {
            void act(() => controller.changeRest(delta));
          }}
          onSkip={() => {
            void act(() => controller.changeRest(null));
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}
