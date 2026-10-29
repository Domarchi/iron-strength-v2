"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useWebTraining } from "./provider";
import { Button } from "@/components/ui/button";
import { isTypedTraining, trainingTitle } from "../../../mobile/src/lib/training";
export function TypedPendingTraining() {
  const { bridge, training, queue, reservation } = useWebTraining(),
    path = usePathname(),
    [error, setError] = useState<string | null>(null);
  if (path.startsWith("/workout/")) return null;
  const active = training.active,
    known =
      active && isTypedTraining(active) && active.routine.origin.kind === "assigned"
        ? active
        : null;
  const entries = queue.entries.filter((e) => e.phase === "pending" || e.phase === "confirmed");
  async function sync() {
    setError(null);
    try {
      await bridge.sync(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo confirmar el envío.");
    }
  }
  if (!active && !entries.length && !training.blocked && !queue.blocked) return null;
  return (
    <section
      aria-label="Registro tipado en este dispositivo"
      className="my-3 space-y-3 rounded-xl border bg-card p-4"
    >
      {active && !known ? (
        <p>
          Conservamos un registro de otra versión. Ábrelo con la app que lo creó o resuélvelo desde
          Cuenta.
        </p>
      ) : null}
      {training.blocked || queue.blocked ? (
        <p role="alert">
          No pudimos verificar un registro local. Se conserva; usa una versión compatible antes de
          comenzar otro.
        </p>
      ) : null}
      {known && known.draft.status === "in_progress" ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{trainingTitle(known)}</p>
            <p className="text-sm text-muted-foreground">En curso · guardado en este dispositivo</p>
          </div>
          <Button
            render={
              <Link
                href={`/workout/${"programSessionId" in known.routine.origin ? known.routine.origin.programSessionId : ""}`}
              />
            }
          >
            Retomar
          </Button>
        </div>
      ) : null}
      {known &&
      known.draft.status === "pending_save" &&
      !entries.some((e) => e.payload.id === known.draft.workoutId) ? (
        <p>Pendiente de enviar · {trainingTitle(known)}</p>
      ) : null}
      {entries.map((e) => (
        <div key={e.payload.id} id={`pending-${e.payload.id}`} className="space-y-2">
          <p className="font-medium">{e.title}</p>
          <p className="text-sm">
            {e.phase === "confirmed"
              ? "Guardado en tu cuenta"
              : "Guardado en este dispositivo · pendiente de enviar"}
          </p>
          {e.error ? (
            <p role="alert" className="text-sm text-destructive">
              {e.error.message}
            </p>
          ) : null}
          {e.phase === "confirmed" ? (
            <Button variant="outline" render={<Link href={`/history/${e.payload.id}`} />}>
              Ver resultado
            </Button>
          ) : null}
        </div>
      ))}
      {error || reservation.error ? <p role="alert">{error ?? reservation.error}</p> : null}
      {entries.some((e) => e.phase === "pending") || known?.draft.status === "pending_save" ? (
        <Button disabled={queue.busy || reservation.reserved} onClick={() => void sync()}>
          Reintentar envío
        </Button>
      ) : null}
    </section>
  );
}
