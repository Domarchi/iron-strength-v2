import { plural } from "../lib/plural";
import { useCallback, useState } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { isWorkoutEditable } from "../../../src/domain/edit-window";
import type { WorkoutRemovalSnapshot } from "../../../src/lib/mobile/workout-removal-contracts";
import { workoutRemovalIssueMessage } from "../../../src/lib/workout/removal-draft";
import { useCorrectionDraft } from "../lib/correction-context";
import { useWorkoutRemoval } from "../lib/workout-removal-context";
import { useSession } from "../lib/session";
import { useQuery } from "../lib/use-query";
import { Action, Notice, Page, ScreenIntro, s, day, usePalette } from "./ui";
export function WorkoutRemovalScreen({ id }: { id: string }) {
  const p = usePalette(),
    { client, state } = useSession(),
    { controller, removal: r } = useWorkoutRemoval(),
    { correction: c } = useCorrectionDraft();
  const userId = state.status === "authenticated" ? state.session.profile.id : "";
  const request = useCallback(() => client.workoutRemoval(id, userId), [client, id, userId]),
    q = useQuery(request);
  const [error, setError] = useState<string | null>(null),
    [discard, setDiscard] = useState(false),
    [reload, setReload] = useState(false),
    [finished, setFinished] = useState(false),
    [fetching, setFetching] = useState(false),
    [latest, setLatest] = useState<WorkoutRemovalSnapshot | null>(null),
    [accepted, setAccepted] = useState<WorkoutRemovalSnapshot | null>(null);
  const [confirmationAtEntry] = useState(r.confirmation);
  const own = r.pending?.request.workoutId === id ? r.pending : null,
    known = own?.review ?? accepted ?? q.value,
    disabled = r.busy || r.paused || fetching,
    correctionPending = c.draft?.base.workout.id === id && !!(c.draft.changed || c.pending),
    correctionBlocked = !c.ready || c.busy || c.paused || c.blocked || correctionPending,
    cause = workoutRemovalIssueMessage(own?.issue ?? null);
  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos completar la eliminación.");
    }
  }
  const back = () => (router.canGoBack() ? router.back() : router.replace("/history"));
  const done =
    r.confirmation &&
    r.confirmation !== confirmationAtEntry &&
    r.confirmation.workoutId === id &&
    !r.pending &&
    !r.dirty;
  const rereadControls = reload ? (
    <>
      <Notice message="Se reemplazará el intento en memoria por el guardado en este dispositivo. Se perderán los cambios que no se pudieron guardar." />
      <Action
        label="Confirmar relectura de eliminación"
        disabled={disabled}
        onPress={() => {
          void run(async () => {
            await controller.reloadLocal(true);
            setReload(false);
          });
        }}
      />
      <Action
        label="Conservar intento en memoria"
        secondary
        disabled={disabled}
        onPress={() => setReload(false)}
      />
    </>
  ) : (
    <Action
      label="Releer eliminación local"
      secondary
      disabled={disabled}
      onPress={() => setReload(true)}
    />
  );
  function summary(v: WorkoutRemovalSnapshot) {
    const w = v.workout;
    return (
      <View style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}>
        <Text style={[s.subheading, { color: p.ink }]}>
          {w.title ?? (w.sessionLabel ? `Sesión ${w.sessionLabel}` : "Entrenamiento")}
        </Text>
        <Text style={[s.body, { color: p.muted }]}>{day(w.performedOn)}</Text>
        <Text style={[s.body, { color: p.ink }]}>
          {plural(w.setCount, "serie", "series")} ·{" "}
          {plural(w.commentCount, "comentario", "comentarios")}
        </Text>
      </View>
    );
  }
  return (
    <Page compact>
      <ScreenIntro title={done ? "Entrenamiento eliminado" : "Eliminar entrenamiento"} />
      {done ? (
        <>
          <Text style={[s.body, { color: p.muted }]}>El servidor confirmó la eliminación.</Text>
          <Action label="Volver a mi semana" onPress={() => router.replace("/")} />
          <Action label="Ver mi historial" secondary onPress={() => router.replace("/history")} />
        </>
      ) : finished ? (
        <>
          <Text style={[s.body, { color: p.muted }]}>Intento descartado en este dispositivo</Text>
          <Action label="Volver a mi semana" onPress={() => router.replace("/")} />
        </>
      ) : (
        <>
          {!r.ready ? (
            <Text style={[s.body, { color: p.muted }]}>Recuperando eliminación…</Text>
          ) : null}
          {error ? <Notice message={error} /> : null}
          {r.error && r.error !== error && r.error !== cause ? <Notice message={r.error} /> : null}
          {cause ? <Notice message={cause} /> : null}
          {(r.blocked || r.dirty) && r.ready ? rereadControls : null}
          {r.blocked ? (
            <>{own ? summary(own.review) : null}</>
          ) : r.pending && !own ? (
            <>
              <Notice message="Hay una eliminación pendiente de otro entrenamiento. Resuélvela antes de continuar." />
              <Action
                label="Revisar eliminación pendiente"
                disabled={disabled}
                onPress={() =>
                  router.replace({
                    pathname: "/remove-result/[id]",
                    params: { id: r.pending!.request.workoutId },
                  })
                }
              />
            </>
          ) : r.ready ? (
            <>
              {known ? summary(known) : null}
              {own ? (
                <>
                  <Text
                    accessibilityLabel="Estado de eliminación"
                    style={[s.caption, { color: p.muted }]}
                  >
                    {r.confirmation
                      ? "Servidor confirmado · limpieza local pendiente"
                      : r.dirty
                        ? "Cambios pendientes de guardar en este dispositivo"
                        : "Pendiente de confirmar en el servidor"}
                  </Text>
                  {r.confirmation ? (
                    <Action
                      label="Completar limpieza local"
                      disabled={disabled || correctionBlocked}
                      onPress={() => {
                        void run(() => controller.retry());
                      }}
                    />
                  ) : r.dirty ? (
                    <Action
                      label="Guardar intento en este dispositivo"
                      disabled={disabled}
                      onPress={() => {
                        void run(() => controller.retryStorage());
                      }}
                    />
                  ) : !own.issue ? (
                    <Action
                      label="Reintentar la misma eliminación"
                      disabled={disabled || correctionBlocked}
                      onPress={() => {
                        void run(() => controller.retry());
                      }}
                    />
                  ) : null}
                  {own.issue === "conflict" ? (
                    <>
                      <Action
                        label="Revisar versión actual"
                        secondary
                        disabled={disabled}
                        onPress={() => {
                          setFetching(true);
                          void run(async () => {
                            const value = await client.workoutRemoval(id, userId);
                            setLatest(value);
                          }).finally(() => setFetching(false));
                        }}
                      />
                      {latest ? (
                        <>
                          <Text style={[s.subheading, { color: p.ink }]}>Versión actual</Text>
                          {summary(latest)}
                          <Text style={[s.caption, { color: p.muted }]}>
                            Revisión {latest.workout.revision}
                          </Text>
                          <Action
                            label="Aceptar versión actual"
                            disabled={disabled}
                            onPress={() => {
                              void run(async () => {
                                await controller.acceptLatest(latest);
                                setAccepted(latest);
                                setLatest(null);
                              });
                            }}
                          />
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {!r.confirmation ? (
                    discard ? (
                      <>
                        <Notice message="Descartar este intento local no restaura el entrenamiento si el servidor ya lo eliminó." />
                        <Action
                          label="Confirmar descarte del intento"
                          secondary
                          disabled={disabled}
                          onPress={() => {
                            void run(async () => {
                              await controller.discard(true);
                              setFinished(true);
                            });
                          }}
                        />
                        <Action
                          label="Conservar intento"
                          secondary
                          disabled={disabled}
                          onPress={() => setDiscard(false)}
                        />
                      </>
                    ) : (
                      <Action
                        label="Descartar intento local"
                        quiet
                        disabled={disabled}
                        onPress={() => setDiscard(true)}
                      />
                    )
                  ) : null}
                </>
              ) : (
                <>
                  {q.loading && !accepted ? (
                    <Text style={[s.body, { color: p.muted }]}>Consultando entrenamiento…</Text>
                  ) : null}
                  {q.error && !accepted ? <Notice message={q.error} retry={q.retry} /> : null}
                  {known && !q.loading && (!q.error || accepted) ? (
                    <>
                      <Text style={[s.body, { color: p.muted }]}>
                        Se eliminarán para siempre este entrenamiento, sus series y comentarios.
                      </Text>
                      {!isWorkoutEditable(known.workout.performedOn, known.today) ? (
                        <Notice message="Terminó el plazo de siete días para eliminar este entrenamiento." />
                      ) : null}
                      <Action
                        label="Eliminar para siempre"
                        danger
                        disabled={
                          disabled ||
                          correctionBlocked ||
                          !isWorkoutEditable(known.workout.performedOn, known.today)
                        }
                        onPress={() => {
                          void run(() => controller.confirm(known));
                        }}
                      />
                    </>
                  ) : null}
                </>
              )}
              {correctionPending ? (
                <>
                  <Notice message="Retoma o descarta la corrección de este entrenamiento antes de eliminarlo." />
                  <Action
                    label="Retomar corrección"
                    secondary
                    disabled={disabled}
                    onPress={() =>
                      router.navigate({ pathname: "/correct-result/[id]", params: { id } })
                    }
                  />
                </>
              ) : c.blocked ? (
                <Notice message="Recupera la corrección local desde Cuenta antes de eliminar entrenamientos." />
              ) : null}
            </>
          ) : null}
          <Action
            label={own || r.blocked ? "Volver sin descartar" : "Cancelar"}
            secondary
            onPress={back}
          />
        </>
      )}
    </Page>
  );
}
