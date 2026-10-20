"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatKg } from "@/domain/format";
import type { ExerciseHistoryPage } from "@/lib/data/exercise-history";
import { exerciseHistoryAction } from "./actions";

// El diálogo se monta junto al registro: nunca reemplaza su borrador ni su temporizador.
export function ExerciseHistoryPanel({
  exerciseId,
  name,
  onClose,
}: {
  exerciseId: string;
  name: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [page, setPage] = useState<ExerciseHistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    mounted.current = true;
    let cancelled = false;
    void exerciseHistoryAction(exerciseId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setPage(result.page);
        else setError(true);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      mounted.current = false;
      element?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [exerciseId]);

  async function loadMore() {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError(false);
    try {
      const result = await exerciseHistoryAction(exerciseId, page?.nextCursor);
      if (!mounted.current) return;
      if (result.ok)
        setPage((previous) => ({
          items: [...(previous?.items ?? []), ...result.page.items],
          nextCursor: result.page.nextCursor,
        }));
      else setError(true);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      pending.current = false;
      if (mounted.current) setLoading(false);
    }
  }

  function close() {
    dialog.current?.close();
    onClose();
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 mx-auto max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-card-foreground shadow-xl backdrop:bg-black/50"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold">
            Historial de {name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tu registro y el descanso siguen activos.
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Cerrar historial" onClick={close}>
          <X aria-hidden />
        </Button>
      </header>
      <div className="mt-4 flex flex-col gap-3" aria-busy={loading}>
        {page?.items.map((workout) => (
          <article key={workout.id} className="rounded-xl border p-3">
            <h3 className="font-semibold">
              {new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "UTC" }).format(
                new Date(`${workout.date}T12:00:00Z`),
              )}
              {workout.sessionLabel ? ` · Sesión ${workout.sessionLabel}` : ""}
            </h3>
            <ul className="mt-2 space-y-1 text-sm tabular-nums">
              {workout.sets.map((set) => (
                <li key={set.id}>
                  {new Set(workout.sets.map((s) => s.position)).size > 1
                    ? `Bloque ${set.position + 1} · `
                    : ""}
                  {set.isWarmup ? "Calentamiento" : `Serie ${set.setNumber}`} ·{" "}
                  {formatKg(set.weightKg)} × {set.reps}
                </li>
              ))}
            </ul>
            <a
              href={`/history/${workout.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline underline-offset-4"
            >
              Ver entrenamiento <span className="sr-only">en otra pestaña</span>
              <ExternalLink className="size-4" aria-hidden />
            </a>
          </article>
        ))}
        {page?.items.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Todavía no tienes registros de este ejercicio.
          </p>
        ) : null}
        {loading ? (
          <p role="status" className="py-3 text-sm">
            Cargando historial…
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            No se pudo cargar el historial. Tu entrenamiento sigue guardado en esta página.
          </p>
        ) : null}
        {error || page?.nextCursor ? (
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {error ? "Reintentar historial" : "Ver más resultados"}
          </Button>
        ) : null}
      </div>
    </dialog>
  );
}
