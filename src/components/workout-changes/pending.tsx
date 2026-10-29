"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useWorkoutChanges } from "./provider";
export function PendingWorkoutChanges() {
  const { correction: c, removal: r, corrections, removals } = useWorkoutChanges();
  const cPending = !!(c.draft?.changed || c.pending || c.error),
    rPending = !!(r.pending || r.error);
  if (!cPending && !rPending) return null;
  return (
    <section
      aria-label="Cambios de entrenamientos pendientes"
      className="space-y-3 rounded-lg border bg-card p-4"
    >
      {cPending ? (
        <div className="space-y-2">
          <h2 className="font-medium">Corrección pendiente</h2>
          {c.error ? (
            <p role="alert" className="text-sm text-muted-foreground">
              {c.error}
            </p>
          ) : null}
          {c.draft ? (
            <Button
              variant="outline"
              render={<Link href={`/history/${c.draft.base.workout.id}/edit`} />}
            >
              Retomar corrección
            </Button>
          ) : c.dirty && !c.blocked ? (
            <Button
              variant="outline"
              disabled={c.busy || c.paused}
              onClick={() => {
                void corrections.retryStorage().catch(() => {});
              }}
            >
              Guardar propuesta en este dispositivo
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={c.busy || c.paused}
              onClick={() => {
                if (c.dirty) {
                  if (
                    window.confirm(
                      "¿Reemplazar la corrección en memoria por la guardada en este dispositivo?",
                    )
                  )
                    void corrections.reloadLocal(true).catch(() => {});
                } else void corrections.restore().catch(() => {});
              }}
            >
              Releer corrección local
            </Button>
          )}
        </div>
      ) : null}
      {rPending ? (
        <div className="space-y-2">
          <h2 className="font-medium">Eliminación pendiente</h2>
          {r.error ? (
            <p role="alert" className="text-sm text-muted-foreground">
              {r.error}
            </p>
          ) : null}
          {r.pending ? (
            <Button
              variant="outline"
              render={<Link href={`/history/${r.pending.request.workoutId}/remove`} />}
            >
              Revisar eliminación
            </Button>
          ) : r.dirty && !r.blocked ? (
            <Button
              variant="outline"
              disabled={r.busy || r.paused}
              onClick={() => {
                void removals.retryStorage().catch(() => {});
              }}
            >
              Guardar intento en este dispositivo
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={r.busy || r.paused}
              onClick={() => {
                if (r.dirty) {
                  if (
                    window.confirm(
                      "¿Reemplazar el intento en memoria por el guardado en este dispositivo?",
                    )
                  )
                    void removals.reloadLocal(true).catch(() => {});
                } else void removals.restore().catch(() => {});
              }}
            >
              Releer eliminación local
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}
