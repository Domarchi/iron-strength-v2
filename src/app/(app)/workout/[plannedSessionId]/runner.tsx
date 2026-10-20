"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CircleCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { restAfterSet, type Rest } from "@/domain/rest-timer";
import { nextSupersetSet, finishedSupersetRound } from "@/domain/superset-rounds";
import { formatKg } from "@/domain/format";
import type { ExerciseHistoryPage } from "@/lib/data/exercise-history";
import type { WorkoutContext } from "@/lib/data/workout-context";
import { clearDraft, loadDraft, type DraftStorage, type WorkoutDraft } from "@/lib/workout/draft";
import { createDraftPersistence, type DraftSaveStatus } from "@/lib/workout/draft-persistence";
import {
  addSet,
  buildPayload,
  completeSet,
  copyPrevious,
  copyLastPerformance,
  copySuggestedValues,
  createDraft,
  finishDraft,
  previousForSet,
  nextPendingExercise,
  isExerciseComplete,
  removeSet,
  setSkipped,
  setExerciseRestSeconds,
  summarize,
  toggleWarmup,
  updateSetField,
  workoutVolume,
} from "@/lib/workout/runner-state";
import { enqueueWorkout, removeConfirmedWorkout } from "@/lib/offline/queue";
import { sendWorkout, syncQueuedWorkout, clearConfirmedDraft } from "@/lib/offline/sync";
import { SYNC_MESSAGES } from "@/lib/offline/sync-contract";
import { ExerciseHistoryPanel } from "./exercise-history-panel";
import { substituteExercise } from "@/lib/workout/substitution";
import { ExerciseCard } from "./exercise-card";
import { RestBar } from "./rest-bar";

function storage(): DraftStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined; // modo privado o bloqueado: se entrena igual, sin borrador
  }
}

function initialDraft(
  userId: string,
  context: WorkoutContext,
  recoveryOnly: boolean,
): WorkoutDraft | null {
  const store = storage();
  const stored = loadDraft(store, userId, context.session.id);
  if (stored) return stored;
  if (recoveryOnly) return null;

  return createDraft({
    workoutId: crypto.randomUUID(),
    userId,
    plannedSession: {
      id: context.session.id,
      programId: context.session.programId,
      label: context.session.label,
    },
    exercises: context.exercises.map((e) => ({
      sessionExerciseId: e.sessionExerciseId,
      exerciseId: e.exerciseId,
      name: e.name,
      isBodyweight: e.isBodyweight,
      prescribed: e.prescribed,
      lastWeightKg: e.lastWeightKg,
      restSeconds: e.restSeconds,
      supersetId: e.supersetId,
      supersetRestSeconds: e.supersetRestSeconds,
      alternatives: e.alternatives,
    })),
    now: new Date(),
  });
}

const FAILURE_MESSAGES = SYNC_MESSAGES;
const NETWORK_MESSAGE =
  "No hay conexión con el servidor. Tu entrenamiento está a salvo en este dispositivo; se reintentará al abrir la app o recuperar conexión mientras esté abierta.";
const UNSAVED_NETWORK_MESSAGE =
  "No hay conexión con el servidor y no se pudo guardar una copia en el dispositivo. Mantén esta página abierta y reintenta el guardado.";

function DraftStatus({ status, onRetry }: { status: DraftSaveStatus; onRetry: () => void }) {
  if (status === "error")
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-card px-3 py-2 text-sm"
      >
        <p className="flex-1 text-destructive">
          No se pudo guardar en este dispositivo. Tu avance sigue en esta página; mantenla abierta.
        </p>
        <Button variant="outline" aria-label="Reintentar guardado local" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    );
  return (
    <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <CircleCheck className="size-3.5" aria-hidden />
      {status === "saved" ? "Guardado en este dispositivo" : "Guardando en este dispositivo…"}
    </p>
  );
}

function elapsedSeconds(startedAt: string) {
  return Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
}

function Elapsed({ startedAt }: { startedAt: string }) {
  const [seconds, setSeconds] = useState(() => elapsedSeconds(startedAt));
  useEffect(() => {
    const tick = () => setSeconds(elapsedSeconds(startedAt));
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return <span>{h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`}</span>;
}

function resumeExercise(draft: WorkoutDraft) {
  const first = nextPendingExercise(draft);
  const target = first?.supersetId ? nextSupersetSet(draft.exercises, first.supersetId) : null;
  return target ? draft.exercises[target.exerciseIndex] : first;
}

const HINT_TEXT = "Revisa el peso y las repeticiones para marcar la serie.";

// Pantalla siempre encendida mientras se entrena (RF-58). Si el dispositivo no lo soporta, no pasa nada.
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) void next.release();
        else lock = next;
      } catch {
        // sin permiso o sin soporte: se entrena igual
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}

// Hoja inferior para confirmar (RF-59): siempre a la vista aunque la lista sea larga.
function ConfirmSheet({
  label,
  children,
  onClose,
}: {
  label: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-label={label}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 text-card-foreground backdrop:bg-black/50"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[90dvh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-t-2xl border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
    </dialog>
  );
}

export function WorkoutRunner({
  userId,
  context,
  recoveryOnly = false,
  localMode = false,
  downloadedHistory,
}: {
  userId: string;
  context: WorkoutContext;
  recoveryOnly?: boolean;
  localMode?: boolean;
  downloadedHistory?: Record<string, ExerciseHistoryPage>;
}) {
  const [initial] = useState(() => initialDraft(userId, context, recoveryOnly));
  if (!initial) {
    return (
      <Card className="mt-6">
        <CardContent className="flex flex-col gap-3">
          <p className="font-medium">Esta sesión no está disponible hoy.</p>
          <p className="text-sm text-muted-foreground">
            No hay un entrenamiento pendiente en este dispositivo. Solo puedes iniciar sesiones de
            la semana en curso.
          </p>
          <Button render={localMode ? <a href="/offline" /> : <Link href="/week" />}>
            Volver a mi semana
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <ActiveWorkoutRunner
      userId={userId}
      context={context}
      initial={initial}
      localMode={localMode}
      downloadedHistory={downloadedHistory}
    />
  );
}

function ActiveWorkoutRunner({
  userId,
  context,
  initial,
  localMode,
  downloadedHistory,
}: {
  userId: string;
  context: WorkoutContext;
  initial: WorkoutDraft;
  localMode: boolean;
  downloadedHistory?: Record<string, ExerciseHistoryPage>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<WorkoutDraft>(initial);
  const [historyExercise, setHistoryExercise] = useState<{ id: string; name: string } | null>(null);
  const [confirming, setConfirming] = useState<"finish" | "discard" | null>(null);
  const [saving, setSaving] = useState(false);
  const [queuedLocally, setQueuedLocally] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<{ setId: string; text: string } | null>(null);
  const [activeId, setActiveId] = useState(
    () => resumeExercise(initial)?.sessionExerciseId ?? null,
  );
  const [undo, setUndo] = useState<{
    draft: WorkoutDraft;
    message: string;
    exerciseId: string | null;
  } | null>(null);
  const [persistence] = useState(() => createDraftPersistence(storage));
  const saveStatus = useSyncExternalStore(
    persistence.subscribe,
    persistence.getSnapshot,
    persistence.getSnapshot,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const rest = draft.rest ?? null;

  const draftRef = useRef(draft);
  const savingRef = useRef(false);

  useWakeLock(draft.status === "in_progress");

  // La primera copia y cada cambio informan su resultado real; los cambios se escriben en commit.
  useEffect(() => {
    persistence.persist(draftRef.current);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (persistence.getSnapshot() === "error") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [persistence]);

  // El borrador vigente se actualiza al instante (sin esperar al render) para que dos toques
  // seguidos nunca trabajen sobre un estado viejo.
  const commit = (next: WorkoutDraft, undoMessage?: string) => {
    setUndo(
      undoMessage ? { draft: draftRef.current, message: undoMessage, exerciseId: activeId } : null,
    );
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    draftRef.current = stamped;
    persistence.persist(stamped);
    setDraft(stamped);
  };
  const update = (fn: (d: WorkoutDraft) => WorkoutDraft) => {
    setHint(null);
    commit(fn(draftRef.current));
  };

  const previousOf = (exIdx: number, setIdx: number) => {
    const exercise = draftRef.current.exercises[exIdx];
    const base = context.exercises.find((c) => c.sessionExerciseId === exercise?.sessionExerciseId);
    const info =
      base?.exerciseId === exercise?.exerciseId
        ? base
        : base?.alternatives?.find((a) => a.exerciseId === exercise?.exerciseId);
    return exercise ? previousForSet(info?.last ?? null, exercise, setIdx) : null;
  };

  // Marcar una serie la completa con lo que falte y arranca el descanso (RF-55, RF-27, RF-60).
  function toggleSet(exIdx: number, setIdx: number) {
    const current = draftRef.current;
    const result = completeSet(current, exIdx, setIdx, previousOf(exIdx, setIdx));
    const wasDone = current.exercises[exIdx]?.sets[setIdx]?.done ?? false;
    if (!result.completed && !wasDone) {
      const set = current.exercises[exIdx]?.sets[setIdx];
      if (set) setHint({ setId: set.id, text: HINT_TEXT });
      return false;
    }
    setHint(null);
    const exercise = current.exercises[exIdx];
    const groupId = exercise.supersetId;
    const groupWork = !!groupId && !result.wasWarmup;
    const shouldRest =
      !groupWork || finishedSupersetRound(current.exercises, result.draft.exercises, groupId);
    const next = result.completed
      ? {
          ...result.draft,
          rest: shouldRest
            ? restAfterSet(
                new Date().getTime(),
                result.wasWarmup,
                groupId ? exercise.supersetRestSeconds : exercise.restSeconds,
              )
            : null,
        }
      : result.draft;
    commit(
      next,
      result.completed
        ? `Serie ${setIdx + 1} de ${current.exercises[exIdx].name} completada`
        : undefined,
    );
    if (result.completed) {
      const exercise = next.exercises[exIdx];
      const target = groupWork ? nextSupersetSet(next.exercises, groupId) : null;
      if (target)
        focusField(next.exercises[target.exerciseIndex].sessionExerciseId, undefined, false);
      else if (isExerciseComplete(exercise))
        setActiveId(
          nextPendingExercise(next, exercise.sessionExerciseId)?.sessionExerciseId ?? null,
        );
    }
    return true;
  }

  function focusField(exerciseId: string, setId?: string, focusInput = true) {
    setActiveId(exerciseId);
    requestAnimationFrame(() => {
      const section = [
        ...(containerRef.current?.querySelectorAll<HTMLElement>("[data-exercise-id]") ?? []),
      ].find((node) => node.dataset.exerciseId === exerciseId);
      const input = [
        ...(section?.querySelectorAll<HTMLInputElement>("input[data-set-id]") ?? []),
      ].find((node) => !setId || node.dataset.setId === setId);
      if (focusInput) input?.focus({ preventScroll: true });
      section?.scrollIntoView?.({
        block: "start",
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
  }

  function completeAndAdvance(exIdx: number, setIdx: number) {
    const exercise = draftRef.current.exercises[exIdx];
    if (!exercise.sets[setIdx].done && !toggleSet(exIdx, setIdx)) return;
    const updated = draftRef.current.exercises[exIdx];
    const groupTarget =
      updated.supersetId && !updated.sets[setIdx].isWarmup
        ? nextSupersetSet(draftRef.current.exercises, updated.supersetId)
        : null;
    if (groupTarget) {
      const target = draftRef.current.exercises[groupTarget.exerciseIndex];
      focusField(target.sessionExerciseId, target.sets[groupTarget.setIndex].id);
      return;
    }
    const nextSet =
      updated.sets.slice(setIdx + 1).find((set) => !set.done) ??
      updated.sets.find((set) => !set.done);
    if (nextSet) focusField(updated.sessionExerciseId, nextSet.id);
    else {
      const next = nextPendingExercise(draftRef.current, updated.sessionExerciseId);
      if (next) focusField(next.sessionExerciseId);
    }
  }

  const submit = useCallback(
    async (d: WorkoutDraft) => {
      if (savingRef.current) return;
      const built = buildPayload(d, new Date());
      if (!built.ok) {
        setError(FAILURE_MESSAGES.no_sets);
        return;
      }
      savingRef.current = true;
      setSaving(true);
      setError(null);
      try {
        let entry = null;
        try {
          entry = await enqueueWorkout(d.userId, built.payload);
          setQueuedLocally(true);
        } catch {
          setQueuedLocally(false);
        }
        const result = entry
          ? await syncQueuedWorkout(d.userId, entry.workoutId, entry.payload)
          : await sendWorkout(d.userId, built.payload);
        if (result.ok) {
          if (!entry) {
            clearConfirmedDraft(d.userId, built.payload);
            await removeConfirmedWorkout(d.userId, d.workoutId).catch(() => undefined);
          }
          const logros = result.achievements?.length
            ? `&logros=${result.achievements.join(",")}`
            : "";
          // El modo local necesita una navegación de documento para que el worker sirva el shell; RSC requiere red.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          if (localMode) window.location.assign(`/history/${d.workoutId}?nuevo=1${logros}`);
          else router.push(`/history/${d.workoutId}?nuevo=1${logros}`);
          return;
        }
        setError(
          result.reason === "network"
            ? entry || persistence.getSnapshot() === "saved"
              ? NETWORK_MESSAGE
              : UNSAVED_NETWORK_MESSAGE
            : FAILURE_MESSAGES[result.reason],
        );
      } catch {
        // Sin red (RF-24): el borrador queda como "pendiente de guardar" y se reintenta solo.
        setError(
          "No se pudo confirmar la sincronización. Conservamos el registro; vuelve a intentarlo.",
        );
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [router, persistence, localMode],
  );

  // Al volver la conexión, reintenta una sesión terminada que no se pudo guardar.
  useEffect(() => {
    const retry = () => {
      if (draftRef.current.status === "pending_save" && navigator.onLine)
        void submit(draftRef.current);
    };
    void Promise.resolve().then(retry);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [submit]);

  const summary = summarize(draft);
  const volume = workoutVolume(draft);
  const nextExercise = activeId ? nextPendingExercise(draft, activeId) : null;

  function requestFinish() {
    if (summary.doneSets === 0) {
      setError("Marca al menos una serie como hecha para finalizar.");
      return;
    }
    setError(null);
    setConfirming("finish");
  }

  async function confirmFinish() {
    setConfirming(null);
    const finished = finishDraft(draftRef.current, new Date());
    commit(finished);
    await submit(finished);
  }

  async function confirmDiscard() {
    if (savingRef.current) return;
    try {
      await removeConfirmedWorkout(userId, draftRef.current.workoutId);
    } catch {
      setError(
        "No se pudo retirar el entrenamiento pendiente. No se descartó; vuelve a intentarlo.",
      );
      return;
    }
    clearDraft(storage(), userId, draft.plannedSessionId);
    // El regreso local debe funcionar también sin RSC ni conexión.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (localMode) window.location.assign("/offline");
    else router.push("/week");
  }

  // Sesión terminada que no llegó al servidor ------------------------------------------------------
  if (draft.status === "pending_save") {
    return (
      <div className="py-6">
        <Card role="region" aria-label="Entrenamiento pendiente de guardar">
          <CardHeader>
            <CardTitle className="text-lg">
              {saving ? "Guardando entrenamiento…" : "Entrenamiento pendiente de sincronizar"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {queuedLocally || saveStatus === "saved"
                ? "Está a salvo en este dispositivo. Se reintenta al abrir la app o recuperar conexión mientras está abierta. No se duplicará."
                : "Tu avance sigue en esta página. Mantenla abierta hasta que se guarde correctamente."}
            </p>
            <DraftStatus
              status={queuedLocally ? "saved" : saveStatus}
              onRetry={() => persistence.persist(draftRef.current)}
            />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => submit(draft)} disabled={saving}>
                {saving ? "Guardando…" : "Reintentar"}
              </Button>
              <Button
                variant="outline"
                render={localMode ? <a href="/offline" /> : <Link href="/week" />}
              >
                Volver a Mi semana
              </Button>
              {confirming === "discard" ? (
                <>
                  <Button variant="destructive" disabled={saving} onClick={confirmDiscard}>
                    Sí, descartar
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(null)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() => setConfirming("discard")}
                >
                  Descartar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Entrenando (modo enfoque, RF-52) ---------------------------------------------------------------
  const percent = summary.totalSets === 0 ? 0 : (summary.doneSets / summary.totalSets) * 100;

  return (
    <div
      ref={containerRef}
      className={rest || undo ? "flex flex-col gap-4 pb-48" : "flex flex-col gap-4 pb-6"}
    >
      <header className="sticky top-0 z-30 -mx-4 border-b bg-background pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2 px-2 py-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              saveStatus === "error"
                ? "Volver a Mi semana (copia local no disponible)"
                : "Volver a Mi semana (tu avance queda guardado)"
            }
            render={localMode ? <a href="/offline" /> : <Link href="/week" />}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base leading-tight font-semibold">
              Sesión {context.session.label} · Semana {context.session.weekNumber}
              {context.session.title ? (
                <span className="block text-sm font-normal text-muted-foreground">
                  {context.session.title}
                </span>
              ) : null}
            </h1>
          </div>
          <Button onClick={requestFinish} disabled={saving} aria-label="Terminar entrenamiento">
            Terminar
          </Button>
        </div>
        <dl className="grid grid-cols-3 gap-3 border-t px-4 py-3">
          <div>
            <dt className="text-[11px] text-muted-foreground">Duración</dt>
            <dd className="mt-1 text-sm font-semibold text-primary tabular-nums">
              <Elapsed startedAt={draft.startedAt} />
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Series</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums">
              {summary.doneSets}
              <span className="font-normal text-muted-foreground"> / {summary.totalSets}</span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Volumen</dt>
            <dd aria-label="Volumen de trabajo" className="mt-1 text-sm font-semibold tabular-nums">
              {formatKg(volume.loadKg)}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-x-2 px-4 pb-2">
          <DraftStatus status={saveStatus} onRetry={() => persistence.persist(draftRef.current)} />
          {nextExercise && nextExercise.sessionExerciseId !== activeId ? (
            <Button
              variant="ghost"
              aria-label="Siguiente ejercicio"
              onClick={() => {
                const next = nextPendingExercise(draftRef.current, activeId ?? undefined);
                if (next) focusField(next.sessionExerciseId);
              }}
            >
              Siguiente <ChevronRight aria-hidden />
            </Button>
          ) : null}
        </div>
        {volume.bodyweightReps > 0 ? (
          <p className="px-4 pb-2 text-xs text-muted-foreground">
            Además, {volume.bodyweightReps} repeticiones sin carga
          </p>
        ) : null}
        <div
          role="progressbar"
          aria-label="Avance de la sesión"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          className="h-0.5 bg-muted"
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      </header>

      {draft.exercises.some((e) => e.supersetId) ? (
        <p
          role="status"
          className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm"
        >
          Alterna los ejercicios de cada superserie. Descansa al terminar la ronda.
          {activeId
            ? ` Ahora: ${draft.exercises.find((e) => e.sessionExerciseId === activeId)?.name ?? ""}.`
            : ""}
        </p>
      ) : null}
      {draft.exercises.map((exercise, exIdx) => {
        const base = context.exercises.find(
          (c) => c.sessionExerciseId === exercise.sessionExerciseId,
        );
        const info =
          base?.exerciseId === exercise.exerciseId
            ? base
            : base?.alternatives?.find((a) => a.exerciseId === exercise.exerciseId);

        if (exercise.skipped) {
          return (
            <section
              key={exercise.sessionExerciseId}
              aria-label={exercise.name}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium line-through">{exercise.name}</p>
                <p className="text-xs text-muted-foreground">Saltado: no se guardará.</p>
              </div>
              <Button variant="outline" onClick={() => update((d) => setSkipped(d, exIdx, false))}>
                Retomar
              </Button>
            </section>
          );
        }

        return (
          <ExerciseCard
            key={exercise.sessionExerciseId}
            exercise={exercise}
            groupLabel={
              exercise.supersetId
                ? `Superserie ${[...new Set(draft.exercises.map((e) => e.supersetId).filter(Boolean))].indexOf(exercise.supersetId) + 1}`
                : undefined
            }
            active={activeId === exercise.sessionExerciseId}
            onActivate={() => setActiveId(exercise.sessionExerciseId)}
            onCompleteAndAdvance={(setIdx) => completeAndAdvance(exIdx, setIdx)}
            info={info}
            hint={hint}
            onField={(setIdx, field, value) =>
              update((d) => updateSetField(d, exIdx, setIdx, field, value))
            }
            onToggleDone={(setIdx) => toggleSet(exIdx, setIdx)}
            onCopyPrevious={(setIdx) => {
              const previous = previousOf(exIdx, setIdx);
              if (previous) update((d) => copyPrevious(d, exIdx, setIdx, previous));
            }}
            onCopyLast={() =>
              commit(
                copyLastPerformance(draftRef.current, exIdx, info?.last ?? null),
                `Valores anteriores copiados en ${exercise.name}`,
              )
            }
            onCopySuggestion={() => {
              if (info?.suggestion)
                commit(
                  copySuggestedValues(draftRef.current, exIdx, info.suggestion),
                  `Sugerencia copiada en ${exercise.name}`,
                );
            }}
            onToggleWarmup={(setIdx) => update((d) => toggleWarmup(d, exIdx, setIdx))}
            onRemoveSet={(setIdx) => {
              setHint(null);
              commit(
                removeSet(draftRef.current, exIdx, setIdx),
                `Serie ${setIdx + 1} de ${exercise.name} eliminada`,
              );
            }}
            onAddSet={() => update((d) => addSet(d, exIdx))}
            onSubstitute={(id) =>
              commit(substituteExercise(draftRef.current, exIdx, id), "Ejercicio sustituido")
            }
            onHistory={() => setHistoryExercise({ id: exercise.exerciseId, name: exercise.name })}
            onSkip={() => update((d) => setSkipped(d, exIdx, true))}
            onRestChange={(seconds) => update((d) => setExerciseRestSeconds(d, exIdx, seconds))}
          />
        );
      })}

      {historyExercise ? (
        <ExerciseHistoryPanel
          key={historyExercise.id}
          exerciseId={historyExercise.id}
          name={historyExercise.name}
          downloaded={downloadedHistory?.[historyExercise.id]}
          onClose={() => setHistoryExercise(null)}
        />
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 pt-2">
        <Button size="lg" onClick={requestFinish} disabled={saving}>
          Finalizar entrenamiento
        </Button>
        <Button
          variant="ghost"
          className="text-destructive"
          onClick={() => setConfirming("discard")}
        >
          Descartar sesión
        </Button>
      </div>

      {undo ? (
        <div
          role="status"
          className={`fixed inset-x-4 z-40 mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-primary/30 bg-card p-3 shadow-lg ${rest ? "bottom-[calc(6.5rem+env(safe-area-inset-bottom))]" : "bottom-[calc(1rem+env(safe-area-inset-bottom))]"}`}
        >
          <p className="flex-1 text-sm">{undo.message}</p>
          <Button
            variant="secondary"
            aria-label="Deshacer última acción"
            onClick={() => {
              const previous = undo;
              commit(previous.draft);
              setActiveId(previous.exerciseId);
            }}
          >
            <Undo2 aria-hidden /> Deshacer
          </Button>
        </div>
      ) : null}
      {rest ? (
        <RestBar
          rest={rest}
          onChange={(next: Rest) => commit({ ...draftRef.current, rest: next })}
          onDismiss={() => commit({ ...draftRef.current, rest: null })}
        />
      ) : null}

      {confirming === "finish" ? (
        <ConfirmSheet
          label="Confirmar el fin del entrenamiento"
          onClose={() => setConfirming(null)}
        >
          <p className="font-medium">
            Completaste {summary.doneSets} de {summary.totalSets} series. ¿Finalizar el
            entrenamiento?
          </p>
          <p className="text-sm text-muted-foreground">
            Volumen de trabajo: {formatKg(volume.loadKg)}
          </p>
          {draft.exercises
            .filter(
              (e) =>
                !e.skipped &&
                e.original &&
                e.original.exerciseId !== e.exerciseId &&
                e.sets.some((s) => s.done),
            )
            .map((e) => (
              <p key={e.sessionExerciseId} className="text-sm">
                {e.name} en lugar de {e.original!.name}
              </p>
            ))}
          <label className="flex flex-col gap-1 text-sm font-medium">
            Esfuerzo percibido (opcional)
            <select
              aria-label="Esfuerzo percibido (opcional)"
              aria-describedby="effort-hint"
              className="min-h-11 rounded-md border bg-background px-3 text-base"
              value={draft.perceivedEffort ?? ""}
              onChange={(e) =>
                commit({
                  ...draftRef.current,
                  perceivedEffort: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            >
              <option value="">Sin registrar</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option value={n} key={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <p id="effort-hint" className="text-xs text-muted-foreground">
            1 = muy fácil · 10 = esfuerzo máximo
          </p>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Nota del entrenamiento (opcional)
            <textarea
              aria-label="Nota del entrenamiento (opcional)"
              className="min-h-24 w-full resize-y rounded-md border bg-background p-3 text-base font-normal"
              maxLength={500}
              rows={3}
              value={draft.note ?? ""}
              onChange={(e) => commit({ ...draftRef.current, note: e.target.value })}
              placeholder="Cómo te fue, molestias o algo que quieras comentar"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {(draft.note ?? "").length}/500 caracteres · se conserva en tu borrador
          </p>
          <Button size="lg" onClick={confirmFinish} disabled={saving}>
            {saving ? "Guardando…" : "Sí, finalizar"}
          </Button>
          <Button variant="outline" onClick={() => setConfirming(null)}>
            Seguir entrenando
          </Button>
        </ConfirmSheet>
      ) : confirming === "discard" ? (
        <ConfirmSheet
          label="Confirmar que se descarta el entrenamiento"
          onClose={() => setConfirming(null)}
        >
          <p className="font-medium">
            ¿Descartar este entrenamiento? Se perderá lo que registraste.
          </p>
          <Button variant="destructive" size="lg" onClick={confirmDiscard}>
            Sí, descartar
          </Button>
          <Button variant="outline" onClick={() => setConfirming(null)}>
            Cancelar
          </Button>
        </ConfirmSheet>
      ) : null}
    </div>
  );
}
