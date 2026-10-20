"use client";
import { StatusMessage } from "@/components/ui/status-message";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { formatKg } from "@/domain/format";
import { Button } from "@/components/ui/button";
import { listQueuedWorkouts } from "@/lib/offline/queue";
import { ingestPendingDrafts, syncAllWorkouts } from "@/lib/offline/sync";
import type { QueueEntry } from "@/lib/offline/queue-contract";
export function SyncWorkouts({
  userId,
  localMode = false,
}: {
  userId: string;
  localMode?: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const focus = path.startsWith("/workout/");
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const running = useRef(false),
    mounted = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const values = await listQueuedWorkouts(userId);
      if (mounted.current) setEntries(values);
    } catch {
      if (mounted.current)
        setError("No se pudieron leer los entrenamientos pendientes. Sus datos se conservan.");
    }
  }, [userId]);
  const synchronize = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      await ingestPendingDrafts(userId);
      if (mounted.current) {
        setBusy(true);
        setError(null);
      }
      const done = await syncAllWorkouts(userId);
      if (mounted.current && done.length) {
        setCompleted((previous) => [...new Set([...previous, ...done])]);
        if (!localMode) router.refresh();
      }
      await refresh();
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "No se pudo completar la sincronización. Conservamos tus registros.",
        );
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [userId, localMode, router, refresh]);
  useEffect(() => {
    if (focus) return;
    mounted.current = true;
    const open = async () => {
      try {
        await ingestPendingDrafts(userId);
        await refresh();
        if (navigator.onLine) await synchronize();
      } catch (e) {
        if (mounted.current)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron incorporar los registros pendientes. Sus borradores se conservan.",
          );
      }
    };
    const retry = () => {
      void synchronize();
    };
    const changed = () => {
      void refresh();
    };
    void open();
    window.addEventListener("online", retry);
    window.addEventListener("offline-queue", changed);
    window.addEventListener("focus", changed);
    return () => {
      mounted.current = false;
      window.removeEventListener("online", retry);
      window.removeEventListener("offline-queue", changed);
      window.removeEventListener("focus", changed);
    };
  }, [focus, synchronize, refresh, userId]);
  if (focus || (!entries.length && !error && !completed.length)) return null;
  return (
    <section
      aria-label="Sincronización de entrenamientos"
      className="my-3 rounded-xl border border-primary/30 bg-card p-4 space-y-3"
    >
      <h2 className="font-semibold">Entrenamientos en este dispositivo</h2>
      {completed.length > 0 && (
        <div role="status" className="space-y-1">
          <p>
            {completed.length === 1
              ? "Entrenamiento sincronizado."
              : `${completed.length} entrenamientos sincronizados.`}
          </p>
          {completed.map((id, i) => (
            <a
              key={id}
              href={`/history/${id}?nuevo=1`}
              className="inline-flex min-h-11 items-center px-2 font-medium text-primary underline"
            >
              Ver entrenamiento{completed.length > 1 ? ` ${i + 1}` : ""}
            </a>
          ))}
        </div>
      )}
      {error && <StatusMessage error>{error}</StatusMessage>}
      {entries.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            {entries.length} pendientes. Se reintentan al abrir la app o recuperar conexión mientras
            está abierta.
          </p>
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.workoutId} className="border-t pt-3">
                <p className="font-medium">
                  Sesión {entry.payload.sessionLabel} · {entry.payload.sets.length} series
                </p>
                {entry.error && <p className="mt-1 text-sm text-destructive">{entry.error}</p>}
                <details className="mt-2 text-sm">
                  <summary className="min-h-11 cursor-pointer py-3 font-medium">
                    Ver registro pendiente
                  </summary>
                  <p>
                    {new Intl.DateTimeFormat("es-CL", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "America/Santiago",
                    }).format(new Date(entry.payload.startedAt))}
                  </p>
                  <ul className="space-y-1 py-2">
                    {entry.payload.sets.map((set, i) => (
                      <li key={i} className="wrap-anywhere">
                        {set.exerciseName} ·{" "}
                        {set.isWarmup ? "Calentamiento" : `Serie ${set.setNumber}`} ·{" "}
                        {formatKg(set.weightKg)} × {set.reps}
                      </li>
                    ))}
                  </ul>
                  {entry.payload.perceivedEffort != null && (
                    <p>Esfuerzo: {entry.payload.perceivedEffort}/10</p>
                  )}
                  {entry.payload.note && <p className="wrap-anywhere">{entry.payload.note}</p>}
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
      {(entries.length > 0 || error) && (
        <Button variant="outline" disabled={busy} onClick={() => void synchronize()}>
          {busy ? "Sincronizando…" : "Sincronizar ahora"}
        </Button>
      )}
    </section>
  );
}
