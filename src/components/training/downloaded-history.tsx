"use client";
import type { TypedExerciseDetail } from "@/lib/mobile/typed-exercise-contracts";
import { formatTrainingMetrics } from "@/domain/training-metrics";
import { SET_TYPE_LABELS } from "../../../mobile/src/lib/training-labels";
import { Button } from "@/components/ui/button";
export function DownloadedExerciseHistory({
  detail,
  downloadedAt,
}: {
  detail?: TypedExerciseDetail;
  downloadedAt?: string;
}) {
  return (
    <section className="space-y-2 border-t pt-3" aria-label="Historial descargado">
      <h3 className="font-medium">Historial del ejercicio</h3>
      <p className="text-xs text-muted-foreground">
        {downloadedAt
          ? `Descargado el ${new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(downloadedAt))}`
          : "Este ejercicio no tiene historial descargado."}
      </p>
      {!detail ? (
        <p className="text-sm">
          El historial no está disponible en esta copia. Actualiza con conexión.
        </p>
      ) : !detail.history.items.length ? (
        <p className="text-sm text-muted-foreground">Aún no había registros al descargar.</p>
      ) : (
        detail.history.items.map((w) => (
          <article key={w.id} className="space-y-1 border-b py-2 text-sm">
            <p className="font-medium">
              {w.date} · {w.title ?? `Sesión ${w.sessionLabel ?? ""}`}
            </p>
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
          </article>
        ))
      )}
      {detail?.history.nextCursor ? (
        <Button
          variant="outline"
          render={<a href="/history" target="_blank" rel="noopener noreferrer" />}
        >
          Más resultados con conexión
        </Button>
      ) : null}
    </section>
  );
}
