"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Flame, Plus, SkipForward, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatKg, formatPrescription } from "@/domain/format";
import type { WorkoutContext, ContextExercise } from "@/lib/data/workout-context";
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
  canComplete,
  createDraft,
  finishDraft,
  removeSet,
  setSkipped,
  summarize,
  toggleDone,
  toggleWarmup,
  updateSetField,
} from "@/lib/workout/runner-state";
import { cn } from "@/lib/utils";
import { saveWorkoutAction } from "./actions";

function storage(): DraftStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined; // modo privado o bloqueado: se entrena igual, sin borrador
  }
}

function initialDraft(userId: string, context: WorkoutContext): WorkoutDraft {
  const store = storage();
  pruneStale(store, userId, Date.now());
  const stored = loadDraft(store, userId, context.session.id);
  if (stored) return stored;

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

const shortDay = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

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

function LastTime({ exercise }: { exercise: ContextExercise }) {
  if (!exercise.last)
    return <p className="text-xs text-muted-foreground">Primera vez con este ejercicio.</p>;
  const working = exercise.last.sets.filter((s) => !s.isWarmup);
  const date = shortDay.format(new Date(`${exercise.last.date}T00:00:00Z`));
  return (
    <p className="text-xs text-muted-foreground">
      Última vez ({date}): {working.map((s) => `${formatKg(s.weightKg)} × ${s.reps}`).join(" · ")}
    </p>
  );
}

function Suggestion({ exercise }: { exercise: ContextExercise }) {
  const s = exercise.suggestion;
  if (!s) return null;
  return (
    <p className="rounded-md border-l-4 border-primary bg-muted px-3 py-2 text-xs text-foreground">
      {s.kind === "increase"
        ? `Sugerencia: sube a ${formatKg(s.weightKg)} y apunta a ${s.reps} repeticiones.`
        : `Sugerencia: mantén ${formatKg(s.weightKg)} y apunta a ${s.reps} repeticiones.`}
    </p>
  );
}

export function WorkoutRunner({ userId, context }: { userId: string; context: WorkoutContext }) {
  const router = useRouter();
  const [draft, setDraft] = useState<WorkoutDraft>(() => initialDraft(userId, context));
  const [confirming, setConfirming] = useState<"finish" | "discard" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftRef = useRef(draft);
  const savingRef = useRef(false);

  // Cada cambio se guarda en el dispositivo (RF-22).
  useEffect(() => {
    draftRef.current = draft;
    saveDraft(storage(), draft);
  }, [draft]);

  const update = (fn: (d: WorkoutDraft) => WorkoutDraft) => {
    const stamp = new Date().toISOString();
    setDraft((d) => ({ ...fn(d), updatedAt: stamp }));
  };

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
          router.push(`/history/${d.workoutId}?nuevo=1`);
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
    const finished = finishDraft(draft, new Date());
    setDraft(finished);
    await submit(finished);
  }

  function confirmDiscard() {
    clearDraft(storage(), userId, draft.plannedSessionId);
    router.push("/week");
  }

  // Sesión terminada que no llegó al servidor ------------------------------------------------------
  if (draft.status === "pending_save") {
    return (
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
    );
  }

  // Entrenando -----------------------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-4">
      <header className="sticky top-0 z-30 -mx-4 flex items-center justify-between gap-3 border-b bg-background px-4 py-2">
        <div>
          <h1 className="text-base font-semibold">
            Sesión {context.session.label} · Semana {context.session.weekNumber}
          </h1>
          <p className="text-xs text-muted-foreground">{context.session.programName}</p>
        </div>
        <div className="text-right text-sm tabular-nums">
          <Elapsed startedAt={draft.startedAt} />
          <p className="text-xs text-muted-foreground">
            {summary.doneSets}/{summary.totalSets} series
          </p>
        </div>
      </header>

      {draft.exercises.map((exercise, exIdx) => {
        const info = context.exercises.find(
          (c) => c.sessionExerciseId === exercise.sessionExerciseId,
        );

        if (exercise.skipped) {
          return (
            <Card key={exercise.sessionExerciseId}>
              <CardContent className="flex items-center justify-between gap-3 pt-6">
                <div>
                  <p className="font-medium line-through">{exercise.name}</p>
                  <p className="text-xs text-muted-foreground">Saltado: no se guardará.</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => update((d) => setSkipped(d, exIdx, false))}
                >
                  Retomar
                </Button>
              </CardContent>
            </Card>
          );
        }

        return (
          <Card key={exercise.sessionExerciseId}>
            <CardHeader className="gap-1">
              <CardTitle className="text-base">{exercise.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {formatPrescription(exercise.prescribed)}
              </p>
              {info?.note ? <p className="text-sm">{info.note}</p> : null}
              {info ? <LastTime exercise={info} /> : null}
              {info ? <Suggestion exercise={info} /> : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="grid grid-cols-[1.75rem_1fr_1fr_2.75rem_2.75rem_2.75rem] items-center gap-2 text-xs text-muted-foreground">
                <span aria-hidden>#</span>
                <span>Kg</span>
                <span>Reps</span>
                <span className="sr-only">Hecha</span>
                <span className="sr-only">Calentamiento</span>
                <span className="sr-only">Quitar</span>
              </div>
              {exercise.sets.map((set, setIdx) => (
                <div
                  key={set.id}
                  className={cn(
                    "grid grid-cols-[1.75rem_1fr_1fr_2.75rem_2.75rem_2.75rem] items-center gap-2",
                    set.done && "opacity-90",
                  )}
                >
                  <span className="text-center text-sm tabular-nums text-muted-foreground">
                    {set.isWarmup ? "C" : setIdx + 1}
                  </span>
                  <Input
                    aria-label={`Peso de la serie ${setIdx + 1} de ${exercise.name} (kg)`}
                    inputMode="decimal"
                    value={set.weight}
                    placeholder={exercise.isBodyweight ? "0" : ""}
                    onChange={(e) =>
                      update((d) => updateSetField(d, exIdx, setIdx, "weight", e.target.value))
                    }
                    className="h-11 px-2 text-center"
                  />
                  <Input
                    aria-label={`Repeticiones de la serie ${setIdx + 1} de ${exercise.name}`}
                    inputMode="numeric"
                    value={set.reps}
                    placeholder={
                      exercise.prescribed.repsMin === exercise.prescribed.repsMax
                        ? String(exercise.prescribed.repsMin)
                        : `${exercise.prescribed.repsMin}–${exercise.prescribed.repsMax}`
                    }
                    onChange={(e) =>
                      update((d) => updateSetField(d, exIdx, setIdx, "reps", e.target.value))
                    }
                    className="h-11 px-2 text-center"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant={set.done ? "default" : "outline"}
                    aria-label={`${set.done ? "Desmarcar" : "Marcar como hecha"} la serie ${setIdx + 1} de ${exercise.name}`}
                    aria-pressed={set.done}
                    disabled={!set.done && !canComplete(exercise, set)}
                    onClick={() => update((d) => toggleDone(d, exIdx, setIdx))}
                  >
                    <Check aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant={set.isWarmup ? "secondary" : "ghost"}
                    aria-label={`Serie ${setIdx + 1} de ${exercise.name} como calentamiento`}
                    aria-pressed={set.isWarmup}
                    onClick={() => update((d) => toggleWarmup(d, exIdx, setIdx))}
                  >
                    <Flame aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Quitar la serie ${setIdx + 1} de ${exercise.name}`}
                    onClick={() => update((d) => removeSet(d, exIdx, setIdx))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => update((d) => addSet(d, exIdx))}
                >
                  <Plus aria-hidden /> Serie
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => update((d) => setSkipped(d, exIdx, true))}
                >
                  <SkipForward aria-hidden /> Saltar ejercicio
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {confirming === "finish" ? (
        <Card role="alertdialog" aria-label="Confirmar el fin del entrenamiento">
          <CardContent className="flex flex-col gap-3 pt-6">
            <p className="font-medium">
              Completaste {summary.doneSets} de {summary.totalSets} series. ¿Finalizar el
              entrenamiento?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={confirmFinish} disabled={saving}>
                {saving ? "Guardando…" : "Sí, finalizar"}
              </Button>
              <Button variant="outline" onClick={() => setConfirming(null)}>
                Seguir entrenando
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : confirming === "discard" ? (
        <Card role="alertdialog" aria-label="Confirmar que se descarta el entrenamiento">
          <CardContent className="flex flex-col gap-3 pt-6">
            <p className="font-medium">
              ¿Descartar este entrenamiento? Se perderá lo que registraste.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" onClick={confirmDiscard}>
                Sí, descartar
              </Button>
              <Button variant="outline" onClick={() => setConfirming(null)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2 pb-4">
          <Button size="lg" onClick={requestFinish} disabled={saving}>
            Finalizar entrenamiento
          </Button>
          <Button variant="ghost" onClick={() => setConfirming("discard")}>
            Descartar sesión
          </Button>
        </div>
      )}
    </div>
  );
}
