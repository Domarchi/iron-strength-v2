import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
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
import { Icon } from "../../../components/icon";
import { Action, Brand, IconAction, Notice, Page, s, usePalette } from "../../../components/ui";
import { WorkoutSets } from "../../../components/workout-sets";
import { useTraining } from "../../../lib/training-context";
import { summarize, workoutVolume } from "../../../../../src/lib/workout/runner-state";
import { substituteExercise } from "../../../../../src/lib/workout/substitution";
import { adjustRest, formatClock, remainingSeconds } from "../../../../../src/domain/rest-timer";
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
  const p = usePalette(),
    { id } = useLocalSearchParams<{ id: string }>(),
    { controller, training } = useTraining(),
    now = useClock();
  const [error, setError] = useState<string | null>(null),
    [closing, setClosing] = useState(false),
    [discard, setDiscard] = useState(false),
    [details, showDetails] = useState<string | null>(null);
  const a = training.active,
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
  if (!a || !d || d.workoutId !== id)
    return (
      <Page>
        <Brand />
        <Notice message={training.error ?? "No hay un entrenamiento activo en esta pantalla."} />
        {training.blocked ? (
          <Action
            label="Reintentar recuperación"
            onPress={() => {
              void controller.restore();
            }}
          />
        ) : null}
        <Action label="Volver a Inicio" onPress={back} />
      </Page>
    );
  const index = Math.min(a.activeIndex, d.exercises.length - 1),
    exercise = d.exercises[index],
    rx = a.routine.exercises[index],
    summary = summarize(d),
    volume = workoutVolume(d),
    pending = d.status === "pending_save";
  const elapsed =
      d.durationSeconds ?? Math.max(0, Math.floor((now - Date.parse(d.startedAt)) / 1000)),
    rest = d.rest ? remainingSeconds(d.rest, now) : 0,
    next = exercise.supersetId ? nextSupersetSet(d.exercises, exercise.supersetId) : null;
  async function finish() {
    await act(async () => {
      const result = pending
        ? await controller.retry()
        : await controller.finish(effort.trim() ? Number(effort) : null, note.trim() || null);
      if (result)
        router.replace({
          pathname: "/result/[id]",
          params: { id: result.id, ...(result.mode === "demo" ? { demo: "1" } : {}) },
        });
    });
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: p.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Page>
        <View style={[s.row, { alignItems: "flex-start" }]}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[s.caption, { color: p.blue }]}>
              {a.mode === "demo" ? "DEMO · " : ""}SESIÓN {d.sessionLabel} ·{" "}
              {pending ? "PENDIENTE DE ENVIAR" : "EN CURSO"}
            </Text>
            <Text style={[s.label, { color: p.ink }]}>
              {a.routine.session.title ?? `Sesión ${d.sessionLabel}`}
            </Text>
            <Text style={[s.number, { color: p.ink, fontSize: 23, lineHeight: 30 }]}>
              {formatClock(elapsed)}{" "}
              <Text style={[s.caption, { color: p.muted }]}>
                · {summary.doneSets}/{summary.totalSets} series
              </Text>
            </Text>
          </View>
          <IconAction label="Volver a Inicio" icon="home" disabled={training.busy} onPress={back} />
        </View>
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
            <Text style={[s.subheading, { color: p.ink }]}>Tu registro está protegido</Text>
            <Text style={[s.body, { color: p.muted }]}>
              {summary.doneSets} series completadas.{" "}
              {a.mode === "demo"
                ? "Guarda el resumen de esta prueba en el dispositivo."
                : "Reintenta el envío sin duplicar el entrenamiento. El coach podrá verlo después de la confirmación del servidor."}
            </Text>
            <Action
              label={a.mode === "demo" ? "Guardar resumen demo" : "Reintentar envío"}
              busy={training.busy}
              onPress={() => {
                void finish();
              }}
            />
          </View>
        ) : (
          <>
            <Text style={[s.caption, { color: p.muted }]}>EJERCICIOS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              contentContainerStyle={{ gap: 8 }}
              style={{ flexGrow: 0 }}
            >
              {d.exercises.map((ex, i) => (
                <Pressable
                  key={ex.sessionExerciseId}
                  accessibilityRole="button"
                  accessibilityLabel={`Ir a ${ex.name}`}
                  accessibilityState={{ selected: i === index }}
                  aria-pressed={i === index}
                  onPress={() => {
                    void act(() => controller.focus(i));
                  }}
                  style={{
                    minHeight: 52,
                    width: 144,
                    borderRadius: 14,
                    borderWidth: 1,
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
              <Text style={[s.heading, { fontSize: 25, lineHeight: 32, color: p.ink }]}>
                {exercise.name}
              </Text>
              <Text style={[s.caption, { color: p.muted }]}>
                {exercise.supersetId
                  ? `Descanso al terminar la ronda: ${exercise.supersetRestSeconds ?? 90} s`
                  : `Descanso entre series: ${exercise.restSeconds ?? 90} s`}
              </Text>
              <WorkoutSets
                index={index}
                onComplete={(si) => {
                  void act(() => controller.complete(index, si));
                }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Indicaciones y alternativas"
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
                  Indicaciones y alternativas
                </Text>
                <Icon
                  name={details === exercise.sessionExerciseId ? "minus" : "plus"}
                  color={p.blue}
                  size={18}
                />
              </Pressable>
              {details === exercise.sessionExerciseId ? (
                <View style={{ gap: 12 }}>
                  {rx.note ? (
                    <Text style={[s.body, { color: p.muted }]}>{rx.note}</Text>
                  ) : (
                    <Text style={[s.caption, { color: p.muted }]}>
                      Sin indicaciones adicionales del coach.
                    </Text>
                  )}
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
                            disabled={exercise.sets.some((x) => x.done)}
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
            {rest > 0 ? (
              <View style={[s.card, { backgroundColor: p.tint, borderColor: p.blue }]}>
                <View style={s.row}>
                  <Text style={[s.subheading, { color: p.ink }]}>Descanso</Text>
                  <Text
                    accessibilityLabel="Tiempo de descanso restante"
                    style={[s.heading, { color: p.blue }]}
                  >
                    {formatClock(rest)}
                  </Text>
                </View>
                <View style={s.row}>
                  <Action
                    label="−15 s"
                    accessibilityLabel="Restar 15 segundos"
                    secondary
                    onPress={() =>
                      controller.edit((draft) => ({
                        ...draft,
                        rest: draft.rest ? adjustRest(draft.rest, Date.now(), -15) : null,
                      }))
                    }
                  />
                  <Action
                    label="+15 s"
                    accessibilityLabel="Sumar 15 segundos"
                    secondary
                    onPress={() =>
                      controller.edit((draft) => ({
                        ...draft,
                        rest: draft.rest ? adjustRest(draft.rest, Date.now(), 15) : null,
                      }))
                    }
                  />
                  <Action
                    label="Saltar"
                    accessibilityLabel="Omitir descanso"
                    secondary
                    onPress={() => controller.edit((draft) => ({ ...draft, rest: null }))}
                  />
                </View>
              </View>
            ) : null}
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
                  {volume.loadKg.toLocaleString("es-CL")} kg de volumen registrado
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
                  label={a.mode === "demo" ? "Guardar demo" : "Guardar entrenamiento"}
                  busy={training.busy}
                  disabled={summary.doneSets === 0 || training.dirty}
                  onPress={() => {
                    void finish();
                  }}
                />
                <Action label="Seguir entrenando" secondary onPress={() => setClosing(false)} />
              </View>
            ) : (
              <Action
                label="Finalizar entrenamiento"
                disabled={summary.doneSets === 0 || training.dirty}
                onPress={() => setClosing(true)}
              />
            )}
          </>
        )}
        {discard ? (
          <>
            <Notice message="¿Descartar este registro local? Las series pendientes se perderán. Los datos que ya estén en el servidor se conservan." />
            <Action
              label="Confirmar descarte"
              secondary
              disabled={training.busy}
              onPress={() => {
                void act(async () => {
                  await controller.discard();
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
            disabled={training.busy}
            onPress={() => setDiscard(true)}
          />
        )}
      </Page>
    </KeyboardAvoidingView>
  );
}
