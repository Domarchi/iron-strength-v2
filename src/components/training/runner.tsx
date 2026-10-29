"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useWebTraining } from "./provider";
import { TypedWebWorkout } from "./workout";
import { isTypedTraining } from "../../../mobile/src/lib/training";
import type { AssignedTrainingContext } from "@/lib/workout/training-context";
import type { WorkoutContext } from "@/lib/data/workout-context";
import { RunnerLoader } from "@/app/(app)/workout/[plannedSessionId]/runner-loader";
import { readAssignedTrainingAction } from "@/app/(app)/workout/[plannedSessionId]/typed-actions";
import { isOfflineInterfaceReady, prepareOfflineInterface } from "@/lib/offline/interface";
import { hasPreviousTraining } from "@/lib/workout/training-guard";
import { listDrafts } from "@/lib/workout/draft";
export function WebRunnerGate({
  userId,
  sessionId,
  context,
  legacy,
  canStart,
}: {
  userId: string;
  sessionId: string;
  context: AssignedTrainingContext | null;
  legacy: WorkoutContext | null;
  canStart: boolean;
}) {
  const { bridge, training, queue, reservation } = useWebTraining(),
    [error, setError] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0),
    [repeat, setRepeat] = useState(false);
  const live = useRef(false),
    started = useRef(false);
  const active = training.active,
    match = queue.entries.findLast(
      (e) =>
        "source" in e.payload &&
        e.payload.source === "assigned" &&
        e.payload.workout.programSessionId === sessionId,
    );
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (
      !training.ready ||
      !queue.ready ||
      training.blocked ||
      queue.blocked ||
      training.active ||
      legacy ||
      !context ||
      !canStart ||
      reservation.reserved ||
      (match && !repeat) ||
      started.current
    )
      return;
    started.current = true;
    const run = async () => {
      try {
        if ("serviceWorker" in navigator) {
          const r = await navigator.serviceWorker.getRegistration("/");
          if (r?.active && !(await isOfflineInterfaceReady())) await prepareOfflineInterface();
        }
        const read = await readAssignedTrainingAction({ version: 1, userId, sessionId });
        if (!live.current || document.visibilityState === "hidden") return;
        if (!read.ok) throw Error(read.message);
        if (hasPreviousTraining(localStorage, userId))
          throw Error(
            "Conservamos borradores anteriores. Retómalos antes de iniciar un registro nuevo.",
          );
        await bridge.perform((c) => c.startTyped(read.value));
      } catch (e) {
        if (live.current) {
          setError(e instanceof Error ? e.message : "No se pudo iniciar la sesión.");
          started.current = false;
        }
      }
    };
    void run();
  }, [
    bridge,
    training.ready,
    training.blocked,
    training.active,
    queue.ready,
    queue.blocked,
    legacy,
    context,
    canStart,
    reservation.reserved,
    match,
    repeat,
    userId,
    sessionId,
    attempt,
  ]);
  if (!training.ready || !queue.ready)
    return (
      <p role="status" className="py-6">
        Recuperando tu registro…
      </p>
    );
  if (
    active &&
    isTypedTraining(active) &&
    active.routine.origin.kind === "assigned" &&
    active.routine.origin.programSessionId === sessionId
  )
    return <TypedWebWorkout active={active} />;
  if (active)
    return (
      <div className="space-y-3 py-6">
        <p>Retoma o resuelve primero el entrenamiento en curso.</p>
        <Button render={<Link href="/week" />}>Volver a mi semana</Button>
      </div>
    );
  if (match && !repeat)
    return (
      <div className="space-y-4 py-6">
        <h1 className="text-xl font-semibold">
          {match.phase === "confirmed" ? "Guardado en tu cuenta" : "Pendiente de enviar"}
        </h1>
        <p>{match.title}</p>
        {match.phase === "pending" ? (
          <>
            <p className="text-sm text-muted-foreground">Guardado en este dispositivo.</p>
            {match.error || reservation.error ? (
              <p role="alert">{match.error?.message ?? reservation.error}</p>
            ) : null}
            <Button disabled={queue.busy} onClick={() => void bridge.sync(true)}>
              Reintentar envío
            </Button>
          </>
        ) : (
          <Button render={<Link href={`/history/${match.payload.id}`} />}>Ver resultado</Button>
        )}
        <Button variant="outline" render={<Link href="/week" />}>
          Volver a mi semana
        </Button>
        {canStart ? (
          <Button
            variant="ghost"
            onClick={() => {
              started.current = false;
              setRepeat(true);
            }}
          >
            Empezar otra sesión
          </Button>
        ) : null}
      </div>
    );
  if (training.blocked || queue.blocked)
    return (
      <div className="space-y-3 py-6">
        <p role="alert">
          {training.error ??
            queue.error ??
            "Un registro local requiere una versión compatible. Se conserva."}
        </p>
        <Button
          onClick={() =>
            void bridge
              .recover()
              .catch((e) => setError(e instanceof Error ? e.message : "No se pudo recuperar."))
          }
        >
          Reintentar recuperación
        </Button>
        <Button variant="outline" render={<Link href="/week" />}>
          Volver a mi semana
        </Button>
      </div>
    );
  if (legacy) {
    if (queue.entries.some((e) => e.phase === "pending"))
      return (
        <div className="space-y-3 py-6">
          <p>Sincroniza los entrenamientos pendientes antes de iniciar esta sesión.</p>
          <Button onClick={() => void bridge.sync(true)}>Reintentar envío</Button>
          <Button variant="outline" render={<Link href="/week" />}>
            Volver a mi semana
          </Button>
        </div>
      );
    return <RunnerLoader userId={userId} context={legacy} recoveryOnly={!canStart} />;
  }
  let previous = false;
  try {
    previous = listDrafts(localStorage, userId).some((d) => d.plannedSessionId === sessionId);
  } catch {
    /* Recovery remains read-only. */
  }
  return (
    <div className="space-y-3 py-6">
      <p role={error ? "alert" : "status"}>
        {error ??
          (canStart
            ? "Preparando tu sesión…"
            : previous
              ? "Conservamos un borrador anterior. La rutina de origen necesita una versión compatible para recuperarlo."
              : "Esta sesión no está disponible hoy.")}
      </p>
      {error ? (
        <Button
          onClick={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        >
          Reintentar inicio
        </Button>
      ) : null}
      <Button variant="outline" render={<Link href="/week" />}>
        Volver a mi semana
      </Button>
    </div>
  );
}
