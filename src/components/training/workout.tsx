"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useWebTraining } from "./provider";
import type { TypedActiveTraining } from "../../../mobile/src/lib/training";
import {
  editTypedSet,
  setTypedSetType,
  typedSetTarget,
  previousTypedSet,
  copyTypedSetPerformance,
  chooseTypedAlternative,
} from "../../../mobile/src/lib/typed-training";
import { trainingFields } from "../../../mobile/src/lib/training-fields";
import { formatTrainingTarget, SET_TYPE_LABELS } from "../../../mobile/src/lib/training-labels";
import { prefillTrainingInput } from "@/domain/training-input";
import { formatTrainingMetrics } from "@/domain/training-metrics";
import { elapsedSessionSeconds } from "@/domain/session-timer";
import { formatClock } from "@/domain/rest-timer";
import { nextSupersetSet } from "@/domain/superset-rounds";
import { RestBar } from "@/app/(app)/workout/[plannedSessionId]/rest-bar";
import type { Bundle } from "@/lib/offline/training-bundle";
import { DownloadedExerciseHistory } from "./downloaded-history";
import { WebCatalogPicker } from "./catalog-picker";
import { TypedExerciseContext } from "./workout-context";
export function TypedWebWorkout({
  active: a,
  local,
}: {
  active: TypedActiveTraining;
  local?: { onHome(): void; bundle: Bundle | null };
}) {
  const { bridge, training, queue, reservation } = useWebTraining();
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now()),
    [error, setError] = useState<string | null>(null),
    [details, setDetails] = useState<string | null>(null),
    [options, setOptions] = useState<string | null>(null),
    [closing, setClosing] = useState(false),
    [discard, setDiscard] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const update = () => setNow(Date.now()),
      id = setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (closing) element?.showModal();
    return () => element?.close();
  }, [closing]);
  const d = a.draft,
    index = Math.min(a.activeIndex, Math.max(0, d.exercises.length - 1)),
    current = d.exercises[index],
    pending = d.status === "pending_save",
    paused = !pending && a.pause?.pausedAtMs != null;
  const locked =
    pending ||
    paused ||
    training.busy ||
    training.closing ||
    training.blocked ||
    queue.blocked ||
    !queue.verified ||
    reservation.reserved;
  const done = d.exercises.reduce(
      (n, e) => n + (e.skipped ? 0 : e.sets.filter((s) => s.done).length),
      0,
    ),
    total = d.exercises.reduce((n, e) => n + (e.skipped ? 0 : e.sets.length), 0);
  const group = current?.supersetId,
    next = group
      ? nextSupersetSet(
          d.exercises.map((e) => ({
            ...e,
            sets: e.sets.map((s) => ({ done: s.done, isWarmup: s.setType === "warmup" })),
          })),
          group,
        )
      : null;
  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la acción.");
    }
  }
  const change = (fn: Parameters<typeof bridge.controller.editTyped>[0]) =>
    act(() => bridge.perform((c) => c.editTyped(fn)));
  if (pending)
    return (
      <div className="space-y-4 py-6">
        <h1 className="text-xl font-semibold">Pendiente de enviar</h1>
        <p>Guardado en este dispositivo.</p>
        <p role="alert">{error ?? training.error ?? queue.error ?? reservation.error}</p>
        <Button
          onClick={() =>
            void act(async () => {
              await bridge.recover();
              await bridge.sync(true);
            })
          }
        >
          Reintentar envío
        </Button>
        <Button
          variant="outline"
          onClick={local?.onHome}
          render={local ? undefined : <Link href="/week" />}
        >
          Volver a mi semana
        </Button>
      </div>
    );
  return (
    <div className="mx-auto max-w-xl space-y-5 pb-48">
      <header className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={local?.onHome}
            render={local ? undefined : <Link href="/week" />}
          >
            {local ? "Inicio" : "Mi semana"}
          </Button>
          <Button disabled={locked || training.dirty} onClick={() => setClosing(true)}>
            Terminar entrenamiento
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div>
            <h1 className="font-semibold">{a.routine.title ?? `Sesión ${d.sessionLabel}`}</h1>
            <p className="text-xs text-muted-foreground">
              {done}/{total} series ·{" "}
              {training.dirty ? "Cambios pendientes" : "Guardado en este dispositivo"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span
              aria-label="Duración del entrenamiento"
              className="whitespace-nowrap text-xl font-semibold tabular-nums"
            >
              {formatClock(elapsedSessionSeconds(Date.parse(d.startedAt), now, a.pause ?? null))}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={paused ? "Reanudar entrenamiento" : "Pausar entrenamiento"}
              disabled={training.dirty || training.busy || reservation.reserved}
              onClick={() =>
                void act(() => bridge.perform((c) => (paused ? c.resume() : c.pause())))
              }
            >
              {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
            </Button>
          </div>
        </div>
      </header>
      {error || training.error || queue.error || reservation.error ? (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{error ?? training.error ?? queue.error ?? reservation.error}</p>
          <Button variant="outline" onClick={() => void act(() => bridge.recover())}>
            Reintentar guardado local
          </Button>
        </div>
      ) : null}
      {paused ? <p role="status">Entrenamiento en pausa. Reanuda para continuar.</p> : null}
      <nav aria-label="Ejercicios del entrenamiento" className="flex gap-2 overflow-x-auto pb-1">
        {d.exercises.map((e, i) => (
          <Button
            key={e.sessionExerciseId}
            variant={i === index ? "secondary" : "ghost"}
            aria-label={`Ir a ${e.name}`}
            aria-pressed={i === index}
            disabled={training.busy || reservation.reserved}
            className="h-auto min-h-11 max-w-44 shrink-0 flex-col items-start gap-0 text-left"
            onClick={() => {
              setDetails(null);
              setOptions(null);
              void act(() => bridge.perform((c) => c.focus(i)));
            }}
          >
            <span className="max-w-full truncate">{e.name}</span>
            <span className="text-xs text-muted-foreground">
              {e.skipped ? "Omitido" : `${e.sets.filter((s) => s.done).length}/${e.sets.length}`}
            </span>
          </Button>
        ))}
      </nav>
      {group ? (
        <p className="text-sm text-muted-foreground">
          Superserie ·{" "}
          {next
            ? `Ronda ${next.round + 1} · sigue ${d.exercises[next.exerciseIndex].name}`
            : "Rondas completadas"}
        </p>
      ) : null}
      {d.exercises.map((e, ex) => {
        if (ex !== index && (!group || e.supersetId !== group)) return null;
        const source = a.routine.exercises[ex],
          history =
            a.routine.version === 5
              ? (a.routine.previousSets.find(
                  (p) => p.exerciseId === e.exerciseId && p.recordType === e.prescribed.recordType,
                )?.sets ?? [])
              : [];
        return (
          <section
            key={e.sessionExerciseId}
            aria-label={e.name}
            className={`space-y-3 border-t pt-4 ${ex === index ? "border-l-2 border-l-primary pl-2" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-primary wrap-anywhere">{e.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {e.prescribed.sets} {e.prescribed.sets === 1 ? "serie" : "series"}
                  {e.restSeconds !== null ? ` · ${e.restSeconds} s de descanso` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                aria-label={`Detalles de ${e.name}`}
                aria-expanded={details === e.sessionExerciseId}
                onClick={() =>
                  setDetails((v) => (v === e.sessionExerciseId ? null : e.sessionExerciseId))
                }
              >
                Detalles
              </Button>
            </div>
            {details === e.sessionExerciseId ? (
              <div className="space-y-3 rounded-lg border p-3">
                {source?.note ? <p className="whitespace-pre-wrap text-sm">{source.note}</p> : null}
                <label className="block space-y-1 text-sm">
                  <span>Nota de {e.name}</span>
                  <Textarea
                    maxLength={500}
                    value={e.athleteNote ?? ""}
                    disabled={locked}
                    onChange={(event) =>
                      void change((draft) => ({
                        ...draft,
                        exercises: draft.exercises.map((r, i) =>
                          i === ex ? { ...r, athleteNote: event.target.value || null } : r,
                        ),
                      }))
                    }
                  />
                </label>
                {source?.alternatives.length ? (
                  <label className="block space-y-1 text-sm">
                    <span>Alternativa para {e.name}</span>
                    <NativeSelect
                      disabled={locked || e.sets.some((s) => s.done)}
                      value={e.exerciseId}
                      onChange={(event) =>
                        void change((draft) =>
                          chooseTypedAlternative(a.routine, draft, ex, event.target.value),
                        )
                      }
                    >
                      {[source, ...source.alternatives].map((choice) => (
                        <option key={choice.exerciseId} value={choice.exerciseId}>
                          {choice.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                ) : null}
                <Button
                  variant="outline"
                  disabled={locked || e.sets.some((s) => s.done)}
                  onClick={() =>
                    void change((draft) => ({
                      ...draft,
                      exercises: draft.exercises.map((r, i) =>
                        i === ex ? { ...r, skipped: !r.skipped } : r,
                      ),
                    }))
                  }
                >
                  {e.skipped ? "Incluir ejercicio" : "Omitir ejercicio"}
                </Button>
                {local ? (
                  <DownloadedExerciseHistory
                    key={`${d.userId}:${e.exerciseId}`}
                    detail={local.bundle?.history[e.exerciseId]}
                    downloadedAt={local.bundle?.downloadedAt}
                  />
                ) : (
                  <TypedExerciseContext
                    key={`${d.userId}:${e.exerciseId}`}
                    userId={d.userId}
                    exerciseId={e.exerciseId}
                  />
                )}
              </div>
            ) : null}
            {!e.skipped ? (
              e.sets.map((set, si) => {
                const target = typedSetTarget(e, si),
                  previous = previousTypedSet(e, si, history);
                return (
                  <div
                    key={set.id}
                    className={`space-y-1 rounded-lg px-1 py-2 ${set.done ? "bg-primary/5" : ""}`}
                  >
                    {target ? (
                      <p className="pl-11 text-xs text-muted-foreground">
                        {formatTrainingTarget(target) || "Sin objetivo indicado"}
                      </p>
                    ) : null}
                    <div className="flex items-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Opciones de serie ${si + 1}`}
                        aria-expanded={options === set.id}
                        disabled={locked}
                        className="shrink-0 font-medium"
                        onClick={() => setOptions((v) => (v === set.id ? null : set.id))}
                      >
                        {set.setType === "working"
                          ? si + 1
                          : set.setType === "warmup"
                            ? "W"
                            : set.setType === "failure"
                              ? "F"
                              : "D"}
                      </Button>
                      {trainingFields(e.prescribed.recordType).map((f) => (
                        <label key={f.field} className="min-w-0 flex-1 space-y-1">
                          <span className="block text-center text-[10px] font-medium tracking-wide text-muted-foreground">
                            {f.label}
                          </span>
                          <Input
                            aria-label={`${f.label} serie ${si + 1}`}
                            inputMode={f.integer ? "numeric" : "decimal"}
                            autoComplete="off"
                            value={set[f.field]}
                            disabled={locked}
                            className="px-1 text-center tabular-nums"
                            onChange={(event) =>
                              void change((draft) =>
                                editTypedSet(draft, ex, si, f.field, event.target.value),
                              )
                            }
                          />
                        </label>
                      ))}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${set.done ? "Desmarcar" : "Completar"} serie ${si + 1}`}
                        aria-pressed={set.done}
                        disabled={locked}
                        onClick={() =>
                          void act(async () => {
                            try {
                              await bridge.perform((c) => c.complete(ex, si));
                            } catch (error) {
                              throw Error(
                                `Serie ${si + 1}: ${error instanceof Error ? error.message : "Revisa sus valores."}`,
                              );
                            }
                          })
                        }
                      >
                        <span
                          className={`flex size-[26px] items-center justify-center rounded-full border ${set.done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50"}`}
                        >
                          <Check className="size-4" strokeWidth={1.7} aria-hidden />
                        </span>
                      </Button>
                    </div>
                    {previous ? (
                      <Button
                        variant="ghost"
                        disabled={locked || set.done}
                        className="h-auto w-full justify-start text-xs text-muted-foreground"
                        aria-label={`Copiar anterior a serie ${si + 1}`}
                        onClick={() =>
                          void change((draft) => copyTypedSetPerformance(draft, ex, si, history))
                        }
                      >
                        Anterior ·{" "}
                        {formatTrainingMetrics({
                          recordType: previous.recordType,
                          weightKg: previous.weightKg,
                          reps: previous.reps,
                          durationSeconds: previous.durationSeconds,
                          distanceMeters: previous.distanceMeters,
                        })}
                      </Button>
                    ) : null}
                    {options === set.id ? (
                      <div className="space-y-2 rounded-lg border p-3">
                        <label className="block space-y-1 text-sm">
                          <span>Tipo de serie {si + 1}</span>
                          <NativeSelect
                            disabled={locked}
                            value={set.setType}
                            onChange={(event) =>
                              void change((draft) =>
                                setTypedSetType(
                                  draft,
                                  ex,
                                  si,
                                  event.target.value as typeof set.setType,
                                ),
                              )
                            }
                          >
                            {Object.entries(SET_TYPE_LABELS).map(([kind, label]) => (
                              <option key={kind} value={kind}>
                                {label}
                              </option>
                            ))}
                          </NativeSelect>
                        </label>
                        <label className="block space-y-1 text-sm">
                          <span>Esfuerzo de serie {si + 1}</span>
                          <Input
                            disabled={locked}
                            inputMode="decimal"
                            value={set.effort}
                            onChange={(event) =>
                              void change((draft) =>
                                editTypedSet(draft, ex, si, "effort", event.target.value),
                              )
                            }
                          />
                        </label>
                        <Button
                          variant="ghost"
                          disabled={locked || e.sets.length <= 1 || set.done}
                          onClick={() =>
                            void change((draft) => ({
                              ...draft,
                              exercises: draft.exercises.map((r, i) =>
                                i === ex ? { ...r, sets: r.sets.filter((_, j) => j !== si) } : r,
                              ),
                            }))
                          }
                        >
                          Quitar serie {si + 1}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">Omitido en este entrenamiento.</p>
            )}
            <Button
              variant="ghost"
              className="w-full"
              disabled={locked || e.skipped || e.sets.length >= 20}
              onClick={() =>
                void change((draft) => ({
                  ...draft,
                  exercises: draft.exercises.map((r, i) =>
                    i === ex
                      ? {
                          ...r,
                          sets: [
                            ...r.sets,
                            {
                              id: crypto.randomUUID(),
                              done: false,
                              ...prefillTrainingInput(
                                r.prescribed,
                                r.sets.filter((s) => s.setType !== "warmup").length,
                                r.lastMetrics,
                              ),
                            },
                          ],
                        }
                      : r,
                  ),
                }))
              }
            >
              Agregar serie
            </Button>
          </section>
        );
      })}
      {local && a.routine.origin.kind !== "assigned" ? (
        <WebCatalogPicker
          entries={local.bundle?.catalog.exercises ?? []}
          limit={15 - d.exercises.length}
          disabled={locked || training.dirty}
          onAdd={(entries) => bridge.perform((c) => c.organizeCatalog({ kind: "add", entries }))}
        />
      ) : null}
      <Button variant="ghost" className="text-muted-foreground" onClick={() => setDiscard(true)}>
        Descartar entrenamiento
      </Button>
      {discard ? (
        <div role="alert" className="space-y-2 rounded-lg border p-4">
          <p>¿Eliminar este entrenamiento de este dispositivo?</p>
          <Button
            variant="destructive"
            disabled={locked}
            onClick={() =>
              void act(async () => {
                await bridge.perform((c) => c.discard());
                if (local) local.onHome();
                else router.replace("/week");
              })
            }
          >
            Sí, descartar registro
          </Button>
          <Button variant="ghost" onClick={() => setDiscard(false)}>
            Cancelar
          </Button>
        </div>
      ) : null}
      {d.rest && !paused && !closing ? (
        <RestBar
          rest={d.rest}
          onChange={(rest) => void change((draft) => ({ ...draft, rest }))}
          onDismiss={() => void act(() => bridge.perform((c) => c.changeRest(null)))}
        />
      ) : null}
      <dialog
        ref={dialog}
        aria-label="Cerrar entrenamiento"
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border bg-card p-5 text-foreground backdrop:bg-black/50"
        onCancel={(event) => {
          event.preventDefault();
          setClosing(false);
        }}
      >
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Cerrar entrenamiento</h2>
          <p>
            {done} series realizadas · {total - done} pendiente{total - done === 1 ? "" : "s"}
          </p>
          <label className="block space-y-1 text-sm">
            <span>Esfuerzo del entrenamiento · opcional</span>
            <Input
              inputMode="numeric"
              value={a.review?.effort ?? ""}
              onChange={(event) =>
                void act(() =>
                  bridge.perform((c) => c.review(event.target.value, a.review?.note ?? "")),
                )
              }
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Nota del entrenamiento</span>
            <Textarea
              value={a.review?.note ?? ""}
              maxLength={500}
              onChange={(event) =>
                void act(() =>
                  bridge.perform((c) => c.review(a.review?.effort ?? "", event.target.value)),
                )
              }
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            className="w-full"
            disabled={training.dirty || training.closing || !done || reservation.reserved}
            onClick={() =>
              void act(async () => {
                await bridge.finish(
                  a.review?.effort.trim() ? Number(a.review.effort) : null,
                  a.review?.note.trim() || null,
                );
                setClosing(false);
              })
            }
          >
            Guardar entrenamiento
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={training.closing}
            onClick={() => setClosing(false)}
          >
            Seguir entrenando
          </Button>
        </div>
      </dialog>
    </div>
  );
}
