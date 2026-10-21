"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrescription } from "@/domain/format";
import type { WorkoutContext } from "@/lib/data/workout-context";
import { previewRoutineAction } from "@/app/(app)/week/actions";

export function RoutinePreview({ sessionId, label }: { sessionId: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        data-routine-preview
        className="w-full"
        aria-label={`Ver rutina de sesión ${label}`}
        onClick={() => setOpen(true)}
      >
        Ver rutina
      </Button>
      {open ? (
        <PreviewPanel sessionId={sessionId} label={label} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function PreviewPanel({
  sessionId,
  label,
  onClose,
}: {
  sessionId: string;
  label: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [context, setContext] = useState<WorkoutContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => {
      element?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void previewRoutineAction(sessionId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setContext(result.context);
          setError(null);
        } else setError(result.error);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo consultar la rutina. Reintenta con conexión.");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, attempt]);
  return (
    <dialog
      ref={dialog}
      aria-label={`Rutina de sesión ${label}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 mx-auto max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-card-foreground shadow-xl backdrop:bg-black/50"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          Sesión {label}
          {context?.session.title ? ` · ${context.session.title}` : ""}
        </h2>
        <Button variant="ghost" size="icon" aria-label="Cerrar vista previa" onClick={onClose}>
          <X aria-hidden />
        </Button>
      </header>
      <p className="mt-1 text-sm text-muted-foreground">
        Consulta tu rutina. El tiempo empieza cuando eliges Empezar.
      </p>
      {!context && !error ? (
        <p role="status" className="py-6">
          Consultando rutina…
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="py-4">
          <p>{error}</p>
          <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar consulta
          </Button>
        </div>
      ) : null}
      {context ? (
        <>
          <ol className="my-4 divide-y">
            {context.exercises.map((ex) => (
              <li key={ex.sessionExerciseId} className="space-y-1 py-4">
                <h3 className="font-semibold">{ex.name}</h3>
                <p className="text-sm">{formatPrescription(ex.prescribed)}</p>
                {ex.supersetId ? (
                  <p className="text-xs font-medium text-primary">
                    Superserie · alterna con los ejercicios del mismo grupo
                  </p>
                ) : null}
                {ex.note ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{ex.note}</p>
                ) : null}
                {ex.alternatives?.length ? (
                  <p className="text-xs text-muted-foreground">
                    Alternativas: {ex.alternatives.map((a) => a.name).join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
          <Button className="w-full" render={<Link href={`/workout/${sessionId}`} />}>
            Empezar entrenamiento
          </Button>
        </>
      ) : null}
    </dialog>
  );
}
