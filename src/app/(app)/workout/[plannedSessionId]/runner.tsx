"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { startRest, type Rest } from "@/domain/rest-timer";
import type { WorkoutContext } from "@/lib/data/workout-context";
import {
  clearDraft,
  loadDraft,
  pruneStale,
  saveDraft,
  type DraftStorage,
  type WorkoutDraft,
} from "@/lib/workout/draft";
import {
  addSet,
  buildPayload,
  completeSet,
  copyPrevious,
  createDraft,
  finishDraft,
  previousForSet,
  removeSet,
  setSkipped,
  summarize,
  toggleWarmup,
  updateSetField,
} from "@/lib/workout/runner-state";
import { saveWorkoutAction } from "./actions";
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
  pruneStale(store, userId, Date.now());
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
    })),
    now: new Date(),
  });
}

const FAILURE_MESSAGES = {
  invalid: "Hay datos inválidos en el entrenamiento. Revisa los pesos y las repeticiones.",
  no_sets: "No completaste ninguna serie.",
  wrong_week:
    "Esta sesión pertenece a otra semana del programa y ya no se puede guardar. Puedes descartarla.",
  not_found: "La sesión ya no existe en tu programa. Puedes descartar este entrenamiento.",
  id_taken: "No se pudo guardar este entrenamiento. Descártalo e inténtalo de nuevo.",
  forbidden: "No tienes permiso para guardar este entrenamiento.",
} as const;

const NETWORK_MESSAGE =
  "No hay conexión con el servidor. Tu entrenamiento está a salvo en este dispositivo; se guardará solo cuando vuelva la conexión.";

function Elapsed({ startedAt }: { startedAt: string }) {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    const tick = () =>
      setSeconds(Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000)));
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (seconds === null) return <span aria-hidden>--:--</span>;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return <span>{h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`}</span>;
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex w-full max-w-xl flex-col gap-3 rounded-t-2xl border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-card-foreground"
      >
        {children}
      </div>
    </div>
  );
}

export function WorkoutRunner({
  userId,
  context,
  recoveryOnly = false,
}: {
  userId: string;
  context: WorkoutContext;
  recoveryOnly?: boolean;
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
          <Button render={<Link href="/week" />}>Volver a mi semana</Button>
        </CardContent>
      </Card>
    );
  }
  return <ActiveWorkoutRunner userId={userId} context={context} initial={initial} />;
}

function ActiveWorkoutRunner({
  userId,
  context,
  initial,
}: {
  userId: string;
  context: WorkoutContext;
  initial: WorkoutDraft;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<WorkoutDraft>(initial);
  const [confirming, setConfirming] = useState<"finish" | "discard" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rest, setRest] = useState<Rest | null>(null);
  const [hint, setHint] = useState<{ setId: string; text: string } | null>(null);

  const draftRef = useRef(draft);
  const savingRef = useRef(false);

  useWakeLock(draft.status === "in_progress");

  // Cada cambio se guarda en el dispositivo (RF-22).
  useEffect(() => {
    saveDraft(storage(), draft);
  }, [draft]);

  // El borrador vigente se actualiza al instante (sin esperar al render) para que dos toques
  // seguidos nunca trabajen sobre un estado viejo.
  const commit = (next: WorkoutDraft) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    draftRef.current = stamped;
    setDraft(stamped);
  };
  const update = (fn: (d: WorkoutDraft) => WorkoutDraft) => {
    setHint(null);
    commit(fn(draftRef.current));
  };

  const previousOf = (exIdx: number, setIdx: number) => {
    const exercise = draftRef.current.exercises[exIdx];
    const info = context.exercises.find((c) => c.sessionExerciseId === exercise?.sessionExerciseId);
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
      return;
    }
    setHint(null);
    commit(result.draft);
    if (result.completed) setRest(startRest(new Date().getTime(), result.wasWarmup));
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
        const result = await saveWorkoutAction(built.payload);
        if (result.ok) {
          clearDraft(storage(), d.userId, d.plannedSessionId);
          const logros = result.achievements?.length
            ? `&logros=${result.achievements.join(",")}`
            : "";
          router.push(`/history/${d.workoutId}?nuevo=1${logros}`);
          return;
        }
        setError(FAILURE_MESSAGES[result.reason]);
      } catch {
        // Sin red (RF-24): el borrador queda como "pendiente de guardar" y se reintenta solo.
        setError(NETWORK_MESSAGE);
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [router],
  );

  // Al volver la conexión, reintenta una sesión terminada que no se pudo guardar.
  useEffect(() => {
    const retry = () => {
      if (draftRef.current.status === "pending_save") void submit(draftRef.current);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [submit]);

  const summary = summarize(draft);

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
    setRest(null);
    const finished = finishDraft(draftRef.current, new Date());
    commit(finished);
    await submit(finished);
  }

  function confirmDiscard() {
    clearDraft(storage(), userId, draft.plannedSessionId);
    router.push("/week");
  }

  // Sesión terminada que no llegó al servidor ------------------------------------------------------
  if (draft.status === "pending_save") {
    return (
      <div className="py-6">
        <Card role="region" aria-label="Entrenamiento pendiente de guardar">
          <CardHeader>
            <CardTitle className="text-lg">Tu entrenamiento terminó, pero no se guardó</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Está a salvo en este dispositivo. Reintenta cuando tengas conexión: no se duplicará.
            </p>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => submit(draft)} disabled={saving}>
                {saving ? "Guardando…" : "Reintentar"}
              </Button>
              {confirming === "discard" ? (
                <>
                  <Button variant="destructive" onClick={confirmDiscard}>
                    Sí, descartar
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(null)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setConfirming("discard")}>
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
    <div className={rest ? "flex flex-col gap-3 pb-28" : "flex flex-col gap-3 pb-6"}>
      <header className="sticky top-0 z-30 -mx-4 border-b bg-background pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2 px-2 py-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Volver a Mi semana (tu avance queda guardado)"
            render={<Link href="/week" />}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base leading-tight font-semibold">
              Sesión {context.session.label} · Semana {context.session.weekNumber}
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
            <dt className="text-[11px] text-muted-foreground">Ejercicios</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums">
              {draft.exercises.length - summary.skippedExercises}
            </dd>
          </div>
        </dl>
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

      {draft.exercises.map((exercise, exIdx) => {
        const info = context.exercises.find(
          (c) => c.sessionExerciseId === exercise.sessionExerciseId,
        );

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
            onToggleWarmup={(setIdx) => update((d) => toggleWarmup(d, exIdx, setIdx))}
            onRemoveSet={(setIdx) => update((d) => removeSet(d, exIdx, setIdx))}
            onAddSet={() => update((d) => addSet(d, exIdx))}
            onSkip={() => update((d) => setSkipped(d, exIdx, true))}
          />
        );
      })}

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

      {rest ? <RestBar rest={rest} onChange={setRest} onDismiss={() => setRest(null)} /> : null}

      {confirming === "finish" ? (
        <ConfirmSheet
          label="Confirmar el fin del entrenamiento"
          onClose={() => setConfirming(null)}
        >
          <p className="font-medium">
            Completaste {summary.doneSets} de {summary.totalSets} series. ¿Finalizar el
            entrenamiento?
          </p>
          <Button size="lg" onClick={confirmFinish} disabled={saving} autoFocus>
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
