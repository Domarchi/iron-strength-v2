import { useEffect, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useTraining } from "../lib/training-context";
import type { TypedActiveTraining } from "../lib/training";
import { useSession } from "../lib/session";
import { useWorkoutSyncQueue } from "../lib/sync-context";
import {
  editTypedSet,
  setTypedSetType,
  typedSetTarget,
  chooseTypedAlternative,
} from "../lib/typed-training";
import { trainingTotals, type RecordType } from "../../../src/domain/training-metrics";
import { parseTrainingSetInput, type TrainingInputField } from "../../../src/domain/training-input";
import { formatClock, remainingSeconds } from "../../../src/domain/rest-timer";
import { nextSupersetSet } from "../../../src/domain/superset-rounds";
import { elapsedSessionSeconds } from "../../../src/domain/session-timer";
import { Action, IconAction, Notice, Page, s, usePalette } from "./ui";
import { RestControls } from "./rest-controls";
import { SetCheck } from "./set-check";
import { formatTrainingTarget } from "../lib/training-labels";
const classes = {
  working: "Trabajo",
  warmup: "Calentamiento",
  failure: "Al fallo",
  drop: "Descendente",
} as const;
const fields = (
  kind: RecordType,
): { field: TrainingInputField; label: string; integer?: boolean }[] => {
  switch (kind) {
    case "bodyweight_reps":
      return [{ field: "reps", label: "REPS", integer: true }];
    case "duration":
      return [{ field: "duration", label: "SEGUNDOS", integer: true }];
    case "weight_duration":
      return [
        { field: "weight", label: "KG" },
        { field: "duration", label: "SEGUNDOS", integer: true },
      ];
    case "distance_duration":
      return [
        { field: "distance", label: "METROS" },
        { field: "duration", label: "SEGUNDOS", integer: true },
      ];
    case "weight_distance":
      return [
        { field: "weight", label: "KG" },
        { field: "distance", label: "METROS" },
      ];
    case "assisted_bodyweight":
      return [
        { field: "weight", label: "ASIST. KG" },
        { field: "reps", label: "REPS", integer: true },
      ];
    default:
      return [
        { field: "weight", label: kind === "weighted_bodyweight" ? "KG EXTRA" : "KG" },
        { field: "reps", label: "REPS", integer: true },
      ];
  }
};
export function TypedWorkout({ active: a }: { active: TypedActiveTraining }) {
  const p = usePalette(),
    { controller, training } = useTraining(),
    { state } = useSession(),
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
  const d = a.draft,
    index = Math.max(0, Math.min(a.activeIndex, d.exercises.length - 1)),
    exercise = d.exercises[index],
    source = a.routine.exercises[index];
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
        <Action label="Volver a Inicio" quiet onPress={() => router.navigate("/")} />
        <View style={s.row}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.caption, { color: p.muted }]}>
              {a.routine.title ?? `Sesión ${d.sessionLabel}`}
            </Text>
            <Text
              accessibilityLabel="Duración del entrenamiento"
              style={[s.heading, s.number, { color: p.ink }]}
            >
              {formatClock(elapsed)}
            </Text>
          </View>
          {!pending ? (
            <IconAction
              label={paused ? "Reanudar entrenamiento" : "Pausar entrenamiento"}
              icon={paused ? "play" : "pause"}
              disabled={training.dirty || training.busy || training.closing}
              onPress={() => {
                void act(() => (paused ? controller.resume() : controller.pause()));
              }}
            />
          ) : null}
        </View>
        <Text style={[s.caption, { color: training.dirty ? p.muted : p.success }]}>
          {training.dirty ? "Cambios pendientes" : "Guardado en este dispositivo"}
        </Text>
        {training.error ? (
          <Notice
            message={training.error}
            retry={() => {
              void act(() => controller.retryStorage());
            }}
          />
        ) : null}
        {error ? <Notice message={error} /> : null}
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
            {exercise.sets.map((set, si) => {
              const target = typedSetTarget(exercise, si);
              return (
                <View
                  key={set.id}
                  style={{
                    gap: 4,
                    paddingVertical: 4,
                    borderBottomWidth: 0.5,
                    borderColor: p.border,
                    backgroundColor: set.done ? p.completed : "transparent",
                    borderRadius: 6,
                  }}
                >
                  {target ? (
                    <Text style={[s.caption, { color: p.muted }]}>
                      {formatTrainingTarget(target)}
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
                    {fields(exercise.prescribed.recordType).map((f) => (
                      <View key={f.field} style={{ flex: 1, gap: 2 }}>
                        <Text
                          style={[s.caption, { color: p.muted, fontSize: 10, textAlign: "center" }]}
                        >
                          {f.label}
                        </Text>
                        <TextInput
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
                              color: p.ink,
                              borderColor: p.control,
                              textAlign: "center",
                              paddingHorizontal: 4,
                              paddingVertical: 4,
                              minHeight: 48,
                            },
                          ]}
                        />
                      </View>
                    ))}
                    <SetCheck
                      number={si + 1}
                      checked={set.done}
                      disabled={locked}
                      onPress={() => {
                        void act(() => controller.complete(index, si));
                      }}
                    />
                  </View>
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
                      <TextInput
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
            <Action label="Detalles del ejercicio" quiet onPress={() => setDetails((v) => !v)} />
            {details ? (
              <View style={{ gap: 10 }}>
                {source.note ? (
                  <Text style={[s.body, { color: p.muted }]}>{source.note}</Text>
                ) : null}
                <Text style={[s.label, { color: p.ink }]}>Tu nota · opcional</Text>
                <TextInput
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
              </View>
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
              disabled={locked || offline || training.dirty}
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
          <View style={{ gap: 10 }}>
            <Text style={[s.subheading, { color: p.ink }]}>Revisa antes de terminar</Text>
            <Text style={[s.body, { color: p.muted }]}>
              {done} series realizadas · {total - done} pendientes
            </Text>
            <Text style={[s.caption, { color: p.muted }]}>
              {totals.externalVolumeKg.toLocaleString("es-CL")} kg de volumen ·{" "}
              {totals.durationSeconds} s registrados · {totals.distanceMeters} m
            </Text>
            <TextInput
              accessibilityLabel="Esfuerzo percibido"
              placeholder="Esfuerzo 1–10 · opcional"
              placeholderTextColor={p.muted}
              keyboardType="number-pad"
              editable={!training.closing}
              value={a.review?.effort ?? ""}
              onChangeText={(v) => controller.review(v, a.review?.note ?? "")}
              style={[s.input, { color: p.ink, borderColor: p.control }]}
            />
            <TextInput
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
            <Action label="Seguir entrenando" quiet onPress={() => setClosing(false)} />
          </View>
        ) : pending ? (
          <Action
            label="Reintentar envío"
            disabled={offline || sync.syncing || training.dirty}
            busy={training.busy}
            onPress={() => {
              void act(() => sync.synchronize());
            }}
          />
        ) : (
          <Action
            label="Finalizar entrenamiento"
            disabled={locked}
            onPress={() => setClosing(true)}
          />
        )}
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
