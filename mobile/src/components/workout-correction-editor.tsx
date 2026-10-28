import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { router, useIsFocused } from "expo-router";
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { ZodError } from "zod";
import { workoutCorrectionIssueMessage } from "../../../src/lib/workout/correction-draft";
import {
  correctionFromForm,
  correctionFormFromSnapshot,
  type WorkoutCorrectionForm,
} from "../../../src/lib/workout/correction-form";
import { useCorrectionDraft } from "../lib/correction-context";
import { useSession } from "../lib/session";
import { useQuery } from "../lib/use-query";
import { Action, Notice, Page, ScreenIntro, s, usePalette, day } from "./ui";
import { ProgressChoice } from "./progress-choice";
type Row = WorkoutCorrectionForm["sets"][number];
const kind = {
  working: "Trabajo",
  warmup: "Calentamiento",
  failure: "Al fallo",
  drop: "Descendente",
} as const;
function values(row: Row) {
  return [
    row.weightKg !== "" ? `${row.weightKg} kg` : null,
    row.reps !== "" ? `${row.reps} reps` : null,
    row.durationSeconds !== "" ? `${row.durationSeconds} s` : null,
    row.distanceMeters !== "" ? `${row.distanceMeters} m` : null,
    row.setType ? kind[row.setType] : row.isWarmup ? "Calentamiento" : null,
    row.effort !== "" ? `Esfuerzo ${row.effort}` : null,
    row.removed ? "Retirada" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
function problem(e: unknown) {
  return e instanceof ZodError
    ? "Revisa los rangos, el esfuerzo entre 1 y 10, las notas de hasta 500 caracteres y conserva al menos una serie."
    : e instanceof Error
      ? e.message
      : "No pudimos completar la operación. Conservamos tu propuesta.";
}
export function WorkoutCorrectionEditor({ id }: { id: string }) {
  const p = usePalette(),
    { client, state } = useSession(),
    { controller, correction: c } = useCorrectionDraft();
  const focused = useIsFocused();
  const userId = state.status === "authenticated" ? state.session.profile.id : "";
  const request = useCallback(() => client.workoutCorrection(id, userId), [client, id, userId]),
    q = useQuery(request);
  const [error, setError] = useState<string | null>(null),
    [review, setReview] = useState(false),
    [discard, setDiscard] = useState(false),
    [reloadLocal, setReloadLocal] = useState(false),
    [finished, setFinished] = useState(false),
    [fetching, setFetching] = useState(false),
    [position, setPosition] = useState(0);
  const [confirmationAtEntry] = useState(c.confirmation);
  const opening = useRef(false);
  useEffect(() => {
    if (
      !focused ||
      !c.ready ||
      c.busy ||
      c.paused ||
      c.blocked ||
      c.dirty ||
      c.pending ||
      c.draft?.changed ||
      c.draft?.base.workout.id === id ||
      (c.confirmation && c.confirmation !== confirmationAtEntry) ||
      finished ||
      opening.current ||
      q.loading ||
      !q.value ||
      q.value.workout.id !== id
    )
      return;
    opening.current = true;
    void controller
      .open(q.value)
      .catch((e) => setError(problem(e)))
      .finally(() => {
        opening.current = false;
      });
  }, [c, controller, q.value, q.loading, id, finished, confirmationAtEntry, focused]);
  const own = c.draft?.base.workout.id === id ? c.draft : null,
    disabled = c.busy || c.paused || c.blocked || fetching,
    pendingCause = workoutCorrectionIssueMessage(c.pending?.issue ?? null),
    protectedMemory = !!(c.dirty || c.draft?.changed || c.pending);
  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(problem(e));
    }
  }
  function change(form: WorkoutCorrectionForm) {
    setReview(false);
    setError(null);
    void controller.change(form).catch((e) => setError(problem(e)));
  }
  function patchSet(row: Row, patch: Partial<Row>) {
    if (own)
      change({
        ...own.form,
        sets: own.form.sets.map((s) => (s.id === row.id ? { ...s, ...patch } : s)),
      });
  }
  function field(
    label: string,
    value: string,
    onChangeText: (v: string) => void,
    numeric = false,
    multiline = false,
  ) {
    return (
      <View style={{ gap: 5, flexGrow: 1, flexBasis: numeric ? 120 : undefined }} key={label}>
        <Text style={[s.caption, { color: p.muted }]}>{label}</Text>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          editable={!disabled && !c.pending && !review}
          maxLength={multiline ? 4000 : 30}
          multiline={multiline}
          keyboardType={numeric ? "decimal-pad" : "default"}
          keyboardAppearance={p.dark ? "dark" : "light"}
          selectionColor={p.blue}
          style={[s.input, { color: p.ink, borderColor: p.control, backgroundColor: p.card }]}
        />
      </View>
    );
  }
  const rereadControls = reloadLocal ? (
    <>
      <Notice message="Se reemplazará la propuesta en memoria por la corrección guardada en este dispositivo. Los cambios que no se pudieron guardar se perderán." />
      <Action
        label="Confirmar relectura local"
        disabled={c.busy || c.paused || fetching}
        onPress={() => {
          void run(async () => {
            await controller.reloadLocal(true);
            setReloadLocal(false);
            setReview(false);
          });
        }}
      />
      <Action
        label="Conservar propuesta en memoria"
        secondary
        disabled={c.busy || c.paused || fetching}
        onPress={() => setReloadLocal(false)}
      />
    </>
  ) : (
    <Action
      label="Releer corrección local"
      secondary
      disabled={c.busy || c.paused || fetching}
      onPress={() => setReloadLocal(true)}
    />
  );
  const back = () => (router.canGoBack() ? router.back() : router.replace("/history"));
  const frame = (content: ReactNode) => (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: p.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Page compact>
        <ScreenIntro title="Corregir entrenamiento" />
        {content}
        <Action label="Volver sin descartar" secondary onPress={back} />
      </Page>
    </KeyboardAvoidingView>
  );
  if (finished)
    return frame(
      <Text style={[s.body, { color: p.muted }]}>Corrección descartada en este dispositivo</Text>,
    );
  if (
    c.confirmation &&
    c.confirmation !== confirmationAtEntry &&
    c.confirmation.workoutId === id &&
    !c.draft &&
    !c.dirty
  )
    return frame(
      <>
        <Text style={[s.subheading, { color: p.success }]}>Corrección confirmada</Text>
        <Action
          label="Ver resultado"
          onPress={() => router.replace({ pathname: "/result/[id]", params: { id } })}
        />
      </>,
    );
  if (!c.ready)
    return frame(<Text style={[s.body, { color: p.muted }]}>Recuperando corrección…</Text>);
  if (c.blocked)
    return frame(
      <>
        <Notice
          message={c.error ?? "No pudimos recuperar la corrección."}
          retry={
            !protectedMemory
              ? () => {
                  void run(() => controller.restore());
                }
              : undefined
          }
        />
        {protectedMemory && c.draft ? (
          <>
            <Text style={[s.subheading, { color: p.ink }]}>Propuesta en memoria</Text>
            {c.draft.form.sets.map((row, i) => (
              <View key={row.id}>
                <Text style={[s.label, { color: p.ink }]}>
                  {c.draft!.base.workout.sets[i].exerciseName} · Serie{" "}
                  {c.draft!.base.workout.sets[i].setNumber}
                </Text>
                <Text
                  accessibilityLabel={`Propuesta de serie ${c.draft!.base.workout.sets[i].setNumber} de ${c.draft!.base.workout.sets[i].exerciseName}`}
                  style={[s.body, { color: p.ink }]}
                >
                  {values(row)}
                </Text>
              </View>
            ))}
            <Text style={[s.body, { color: p.ink }]}>
              Esfuerzo: {c.draft.form.perceivedEffort || "Sin indicar"} · Nota:{" "}
              {c.draft.form.note || "Sin nota"}
            </Text>
            {c.draft.form.exerciseNotes?.map((n, i) => (
              <Text key={n.sessionExerciseId} style={[s.body, { color: p.ink }]}>
                Nota de ejercicio {i + 1}: {n.note || "Sin nota"}
              </Text>
            ))}
            {rereadControls}
          </>
        ) : null}
      </>,
    );
  if (!own)
    return frame(
      <>
        {c.draft && (c.draft.changed || c.pending || c.dirty) ? (
          <>
            <Notice message="Ya tienes una corrección pendiente. Retómala antes de abrir otra." />
            <Action
              label="Retomar corrección"
              onPress={() =>
                router.replace({
                  pathname: "/correct-result/[id]",
                  params: { id: c.draft!.base.workout.id },
                })
              }
            />
          </>
        ) : (
          <>
            {q.error ? <Notice message={q.error} retry={q.retry} /> : null}
            {error ? <Notice message={error} /> : null}
            {!q.error && !error ? (
              <Text style={[s.body, { color: p.muted }]}>Cargando resultado…</Text>
            ) : null}
          </>
        )}
      </>,
    );
  const { base, form } = own,
    w = base.workout;
  const rows = w.structure?.exercises.map((e, i) => ({
    id: e.id,
    name: w.sets.find((s) => s.position === i)?.exerciseName ?? `Ejercicio ${i + 1}`,
    position: i,
  })) ?? [
    ...new Map(
      w.sets.map((s) => [
        s.position,
        {
          id: s.sessionExerciseId ?? String(s.position),
          name: s.exerciseName,
          position: s.position,
        },
      ]),
    ).values(),
  ];
  const baseline = correctionFormFromSnapshot(base),
    remoteForm = c.comparison ? correctionFormFromSnapshot(c.comparison.latest) : null;
  const active = rows.find((r) => r.position === position) ?? rows[0],
    removed = form.sets.filter((s) => s.removed).length;
  const localStatus = c.dirty
    ? "Cambios pendientes de guardar en este dispositivo"
    : c.pending
      ? c.pending.issue
        ? "Corrección por revisar"
        : "Pendiente de confirmar en el servidor"
      : own.changed
        ? "Guardado en este dispositivo"
        : "Sin cambios";
  return frame(
    <>
      <Text style={[s.subheading, { color: p.ink }]}>
        {w.title ?? `Sesión ${w.sessionLabel ?? "registrada"}`} · {day(w.performedOn)}
      </Text>
      <Text
        accessibilityLabel="Estado de corrección"
        accessibilityLiveRegion="polite"
        style={[s.caption, { color: p.muted }]}
      >
        {localStatus}
      </Text>
      {error && !c.error ? <Notice message={error} /> : null}
      {pendingCause ? (
        <Text
          accessibilityLabel="Motivo de corrección pendiente"
          accessibilityRole="alert"
          style={[s.body, { color: p.ink }]}
        >
          {pendingCause}
        </Text>
      ) : null}
      {c.error && c.error !== pendingCause ? (
        <Notice
          message={c.error}
          retry={
            c.dirty
              ? () => {
                  void run(() => controller.retryStorage());
                }
              : undefined
          }
        />
      ) : null}
      {c.confirmation && c.dirty ? (
        <Text style={[s.caption, { color: p.success }]}>
          Servidor confirmado; falta verificar la limpieza local.
        </Text>
      ) : null}
      {c.comparison ? (
        <View style={[s.card, { borderColor: p.border, backgroundColor: p.card }]}>
          <Text style={[s.subheading, { color: p.ink }]}>Revisar versión actual</Text>
          <Text style={[s.caption, { color: p.muted }]}>
            Se conservan tus campos modificados y los cambios remotos en los demás campos.
          </Text>
          <Text style={[s.label, { color: p.ink }]}>Nota actual</Text>
          <Text style={[s.body, { color: p.ink }]}>
            {c.comparison.latest.workout.note ?? "Sin nota"}
          </Text>
          <Text style={[s.label, { color: p.ink }]}>Nota propuesta</Text>
          <Text style={[s.body, { color: p.ink }]}>{c.comparison.form.note || "Sin nota"}</Text>
          <Text style={[s.caption, { color: p.muted }]}>
            Esfuerzo actual: {c.comparison.latest.workout.perceivedEffort ?? "Sin indicar"} ·
            Propuesto: {c.comparison.form.perceivedEffort || "Sin indicar"}
          </Text>
          {c.comparison.form.sets.map((row, i) => (
            <View key={row.id} style={{ gap: 4 }}>
              <Text style={[s.label, { color: p.ink }]}>
                {c.comparison!.latest.workout.sets[i].exerciseName} · Serie{" "}
                {c.comparison!.latest.workout.sets[i].setNumber}
              </Text>
              <Text style={[s.caption, { color: p.muted }]}>
                Actual: {values(remoteForm!.sets[i])}
              </Text>
              <Text style={[s.body, { color: p.ink }]}>Propuesta: {values(row)}</Text>
            </View>
          ))}
          {c.comparison.form.exerciseNotes?.map((n) => (
            <View key={n.sessionExerciseId}>
              <Text style={[s.caption, { color: p.muted }]}>
                Nota de ejercicio · Actual:{" "}
                {c.comparison!.latest.workout.exerciseNotes?.find(
                  (r) => r.sessionExerciseId === n.sessionExerciseId,
                )?.note ?? "Sin nota"}
              </Text>
              <Text style={[s.body, { color: p.ink }]}>Propuesta: {n.note || "Sin nota"}</Text>
            </View>
          ))}
          {c.comparison.unapplied.map((row) => (
            <View key={row.id}>
              <Text style={[s.label, { color: p.ink }]}>
                {row.exerciseName} · Serie {row.setNumber} eliminada en el servidor
              </Text>
              <Text style={[s.body, { color: p.ink }]}>{values(row.values)}</Text>
            </View>
          ))}
          {c.comparison.unapplied.length ? (
            <Text style={[s.body, { color: p.muted }]}>
              Al aceptar, estos cambios de series eliminadas no se aplicarán.
            </Text>
          ) : null}
          <Action
            label={
              c.comparison.unapplied.length
                ? "Aceptar sin las series eliminadas"
                : "Aceptar versión revisada"
            }
            disabled={disabled || c.dirty}
            onPress={() => {
              void run(async () => {
                await controller.acceptComparison(!!c.comparison?.unapplied.length);
                setReview(false);
              });
            }}
          />
        </View>
      ) : null}
      {!c.pending && !c.comparison && !review ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
            {rows.map((r) => (
              <ProgressChoice
                key={r.id}
                label={r.name}
                selected={active?.position === r.position}
                onPress={() => setPosition(r.position)}
              />
            ))}
          </View>
          {active ? (
            <View style={{ gap: 12 }}>
              <Text style={[s.subheading, { color: p.ink }]}>{active.name}</Text>
              {form.sets.map((row, i) =>
                w.sets[i].position === active.position ? (
                  <View key={row.id} style={[s.divider, { borderColor: p.border, gap: 10 }]}>
                    <Text style={[s.label, { color: p.ink }]}>
                      Serie {w.sets[i].setNumber}
                      {row.removed ? " · Retirada" : ""}
                    </Text>
                    {!row.removed ? (
                      <>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                          {w.sets[i].metrics.weightKg !== null
                            ? field(
                                `Peso en kg de serie ${w.sets[i].setNumber}`,
                                row.weightKg,
                                (v) => patchSet(row, { weightKg: v }),
                                true,
                              )
                            : null}
                          {w.sets[i].metrics.reps !== null
                            ? field(
                                `Repeticiones de serie ${w.sets[i].setNumber}`,
                                row.reps,
                                (v) => patchSet(row, { reps: v }),
                                true,
                              )
                            : null}
                          {w.sets[i].metrics.durationSeconds !== null
                            ? field(
                                `Segundos de serie ${w.sets[i].setNumber}`,
                                row.durationSeconds,
                                (v) => patchSet(row, { durationSeconds: v }),
                                true,
                              )
                            : null}
                          {w.sets[i].metrics.distanceMeters !== null
                            ? field(
                                `Metros de serie ${w.sets[i].setNumber}`,
                                row.distanceMeters,
                                (v) => patchSet(row, { distanceMeters: v }),
                                true,
                              )
                            : null}
                        </View>
                        {row.setType !== null ? (
                          <>
                            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                              {(Object.keys(kind) as (keyof typeof kind)[]).map((k) => (
                                <ProgressChoice
                                  key={k}
                                  label={kind[k]}
                                  selected={row.setType === k}
                                  onPress={() => {
                                    if (!disabled && !review)
                                      patchSet(row, { setType: k, isWarmup: k === "warmup" });
                                  }}
                                />
                              ))}
                            </View>
                            {field(
                              `Esfuerzo de serie ${w.sets[i].setNumber}`,
                              row.effort,
                              (v) => patchSet(row, { effort: v }),
                              true,
                            )}
                          </>
                        ) : (
                          <Action
                            label={
                              row.isWarmup
                                ? "Cambiar a serie de trabajo"
                                : "Cambiar a calentamiento"
                            }
                            secondary
                            disabled={disabled || review}
                            onPress={() => patchSet(row, { isWarmup: !row.isWarmup })}
                          />
                        )}
                      </>
                    ) : null}
                    <Action
                      label={
                        row.removed
                          ? `Conservar serie ${w.sets[i].setNumber}`
                          : `Retirar serie ${w.sets[i].setNumber}`
                      }
                      secondary
                      disabled={
                        disabled || review || (!row.removed && form.sets.length - removed <= 1)
                      }
                      onPress={() => patchSet(row, { removed: !row.removed })}
                    />
                  </View>
                ) : null,
              )}
              {!w.sets.some((s) => s.position === active.position) ? (
                <Text style={[s.caption, { color: p.muted }]}>Sin series registradas</Text>
              ) : null}
              {form.exerciseNotes?.find((n) => n.sessionExerciseId === active.id)
                ? field(
                    "Nota del ejercicio",
                    form.exerciseNotes.find((n) => n.sessionExerciseId === active.id)!.note,
                    (v) =>
                      change({
                        ...form,
                        exerciseNotes: form.exerciseNotes!.map((n) =>
                          n.sessionExerciseId === active.id ? { ...n, note: v } : n,
                        ),
                      }),
                    false,
                    true,
                  )
                : null}
            </View>
          ) : null}
          {field(
            "Esfuerzo del entrenamiento",
            form.perceivedEffort,
            (v) => change({ ...form, perceivedEffort: v }),
            true,
          )}
          {field(
            "Nota del entrenamiento",
            form.note,
            (v) => change({ ...form, note: v }),
            false,
            true,
          )}
        </>
      ) : null}
      {(review || c.pending) && !c.comparison ? (
        <View style={[s.card, { borderColor: p.border, backgroundColor: p.card }]}>
          <Text style={[s.subheading, { color: p.ink }]}>Revisar corrección</Text>
          <Text style={[s.body, { color: p.ink }]}>
            {form.sets.length - removed}{" "}
            {form.sets.length - removed === 1 ? "serie conservada" : "series conservadas"} ·{" "}
            {removed} {removed === 1 ? "retirada" : "retiradas"}
          </Text>
          {form.sets.map((row, i) => (
            <View key={row.id}>
              <Text style={[s.label, { color: p.ink }]}>
                {w.sets[i].exerciseName} · Serie {w.sets[i].setNumber}
              </Text>
              <Text style={[s.caption, { color: p.muted }]}>Antes: {values(baseline.sets[i])}</Text>
              <Text style={[s.body, { color: p.ink }]}>Después: {values(row)}</Text>
            </View>
          ))}
          <Text style={[s.body, { color: p.ink }]}>
            Esfuerzo: {form.perceivedEffort || "Sin indicar"} · Nota: {form.note || "Sin nota"}
          </Text>
          {form.exerciseNotes?.map((note, i) => (
            <View key={note.sessionExerciseId}>
              <Text style={[s.caption, { color: p.muted }]}>
                Nota · {rows[i]?.name ?? `Ejercicio ${i + 1}`}
              </Text>
              <Text style={[s.body, { color: p.ink }]}>{note.note || "Sin nota"}</Text>
            </View>
          ))}
          {!c.pending ? (
            <>
              <Action
                label="Confirmar corrección"
                busy={c.busy}
                disabled={disabled || c.dirty}
                onPress={() => {
                  void run(() => controller.submit());
                }}
              />
              <Action
                label="Seguir editando"
                secondary
                disabled={disabled}
                onPress={() => setReview(false)}
              />
            </>
          ) : null}
        </View>
      ) : null}
      {!c.pending && !review && !c.comparison ? (
        <Action
          label="Revisar corrección"
          disabled={disabled || c.dirty || !own.changed}
          onPress={() => {
            try {
              correctionFromForm(base, form, w.id);
              setError(null);
              setReview(true);
            } catch (e) {
              setError(problem(e));
            }
          }}
        />
      ) : null}
      {c.pending?.issue === "conflict" && !c.comparison ? (
        <Action
          label="Comparar con versión actual"
          disabled={disabled || c.dirty}
          onPress={() => {
            void run(async () => {
              setFetching(true);
              try {
                const latest = await client.workoutCorrection(id, userId);
                controller.prepareComparison(latest);
              } finally {
                setFetching(false);
              }
            });
          }}
        />
      ) : null}
      {c.pending?.issue === "invalid_input" ? (
        <Action
          label="Revisar datos rechazados"
          disabled={disabled || c.dirty}
          onPress={() => {
            void run(async () => {
              await controller.resumeEditing();
              setReview(false);
            });
          }}
        />
      ) : null}
      {c.pending && !c.pending.issue ? (
        <Action
          label="Reintentar el mismo envío"
          busy={c.busy}
          disabled={disabled || c.dirty}
          onPress={() => {
            void run(() => controller.submit());
          }}
        />
      ) : null}
      {c.pending?.issue && ["forbidden", "not_found", "edit_locked"].includes(c.pending.issue) ? (
        <Action
          label="Recomprobar el mismo envío"
          disabled={disabled || c.dirty}
          onPress={() => {
            void run(async () => {
              await controller.retryRejected();
              await controller.submit();
            });
          }}
        />
      ) : null}
      {c.dirty && !c.busy ? rereadControls : null}
      {discard ? (
        <>
          <Notice message="Se descarta solo esta propuesta local. El entrenamiento guardado en tu cuenta se conserva." />
          <Action
            label="Confirmar descarte de corrección"
            disabled={disabled}
            onPress={() => {
              void run(async () => {
                await controller.discard();
                setFinished(true);
              });
            }}
          />
          <Action
            label="Conservar corrección"
            secondary
            disabled={disabled}
            onPress={() => setDiscard(false)}
          />
        </>
      ) : (
        <Action
          label="Descartar corrección"
          quiet
          disabled={disabled}
          onPress={() => setDiscard(true)}
        />
      )}
    </>,
  );
}
