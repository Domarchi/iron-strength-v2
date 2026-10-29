"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { readTypedExerciseHistoryAction } from "@/app/(app)/workout/[plannedSessionId]/typed-actions";
import type { TypedExerciseDetail } from "@/lib/mobile/typed-exercise-contracts";
import { formatTrainingMetrics } from "@/domain/training-metrics";
import { SET_TYPE_LABELS } from "../../../mobile/src/lib/training-labels";
export function TypedExerciseContext({
  userId,
  exerciseId,
}: {
  userId: string;
  exerciseId: string;
}) {
  const [pages, setPages] = useState<TypedExerciseDetail["history"][]>([]),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0),
    [cursor, setCursor] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void readTypedExerciseHistoryAction({ userId, exerciseId, cursor })
      .then((result) => {
        if (!live) return;
        setBusy(false);
        if (result.ok) {
          setError(null);
          setPages((previous) =>
            cursor === null ? [result.history] : [...previous, result.history],
          );
        } else setError(result.error);
      })
      .catch(() => {
        if (live) {
          setBusy(false);
          setError("No se pudo consultar el historial.");
        }
      });
    return () => {
      live = false;
    };
  }, [userId, exerciseId, cursor, attempt]);
  const history = pages.flatMap((p) => p.items),
    next = pages.at(-1)?.nextCursor;
  return (
    <div className="space-y-2 border-t pt-3">
      <h3 className="font-medium">Historial del ejercicio</h3>
      {!pages.length && !error ? (
        <p role="status" className="text-sm">
          Consultando…
        </p>
      ) : null}
      {error ? (
        <div role="alert">
          <p className="text-sm">{error}</p>
          <Button
            variant="ghost"
            onClick={() => {
              setBusy(true);
              setAttempt((n) => n + 1);
            }}
          >
            Reintentar historial
          </Button>
        </div>
      ) : null}
      {pages.length && !history.length ? (
        <p className="text-sm text-muted-foreground">Aún no hay registros de este ejercicio.</p>
      ) : null}
      {history.map((w) => (
        <div key={w.id} className="border-b py-2 text-sm">
          <Button variant="link" className="px-0" render={<Link href={`/history/${w.id}`} />}>
            {w.date} · {w.title ?? `Sesión ${w.sessionLabel ?? ""}`}
          </Button>
          <ul className="space-y-1">
            {w.sets.map((s) => (
              <li key={s.id}>
                {SET_TYPE_LABELS[s.setType]} · {formatTrainingMetrics(s.metrics)}
                {s.effort !== null ? ` · Esfuerzo ${s.effort}` : ""}
              </li>
            ))}
          </ul>
          {w.exerciseNotes.map((n) =>
            n.note ? (
              <p key={n.position} className="whitespace-pre-wrap text-muted-foreground">
                {n.note}
              </p>
            ) : null,
          )}
        </div>
      ))}
      {next ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setCursor(next);
          }}
        >
          Más resultados
        </Button>
      ) : null}
    </div>
  );
}
