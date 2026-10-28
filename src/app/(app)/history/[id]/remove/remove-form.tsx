"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useWorkoutChanges } from "@/components/workout-changes/provider";
import { isWorkoutEditable } from "@/domain/edit-window";
import { workoutRemovalIssueMessage } from "@/lib/workout/removal-draft";
import type { WorkoutRemovalSnapshot } from "@/lib/mobile/workout-removal-contracts";
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border p-3 text-sm wrap-anywhere">
      {children}
    </p>
  );
}
function Summary({ value }: { value: WorkoutRemovalSnapshot }) {
  const w = value.workout;
  return (
    <section className="space-y-2 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-medium">
        {w.title ?? `Sesión ${w.sessionLabel ?? "registrada"}`}
      </h2>
      <p className="text-sm text-muted-foreground">
        {new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "UTC" }).format(
          new Date(w.performedOn + "T00:00:00Z"),
        )}
      </p>
      <p>
        {w.setCount} series · {w.commentCount} comentarios
      </p>
    </section>
  );
}
export function RemoveWorkoutForm({
  workoutId,
  initial,
  initialError,
}: {
  workoutId: string;
  initial: WorkoutRemovalSnapshot | null;
  initialError: string | null;
}) {
  const { removals: controller, removal: r, correction: c, readRemoval } = useWorkoutChanges();
  const [error, setError] = useState<string | null>(null),
    [discard, setDiscard] = useState(false),
    [reload, setReload] = useState(false),
    [finished, setFinished] = useState(false),
    [fetching, setFetching] = useState(false),
    [latest, setLatest] = useState<WorkoutRemovalSnapshot | null>(null),
    [accepted, setAccepted] = useState<WorkoutRemovalSnapshot | null>(null);
  const [confirmationAtEntry] = useState(r.confirmation);
  const own = r.pending?.request.workoutId === workoutId ? r.pending : null,
    value = own?.review ?? accepted ?? initial,
    disabled = r.busy || r.paused || fetching,
    correctionPending = c.draft?.base.workout.id === workoutId && !!(c.draft.changed || c.pending),
    correctionBlocked = !c.ready || c.busy || c.paused || c.blocked || correctionPending,
    cause = workoutRemovalIssueMessage(own?.issue ?? null),
    done =
      r.confirmation &&
      r.confirmation !== confirmationAtEntry &&
      r.confirmation.workoutId === workoutId &&
      !r.pending &&
      !r.dirty;
  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos confirmar la eliminación.");
    }
  }
  if (done)
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Entrenamiento eliminado</h1>
        <p className="text-sm text-muted-foreground">El servidor confirmó la eliminación.</p>
        <Button render={<Link href="/history" />}>Ver mi historial</Button>
        <Button variant="outline" render={<Link href="/week" />}>
          Volver a mi semana
        </Button>
      </div>
    );
  if (finished)
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Intento descartado en este dispositivo</h1>
        <Button render={<Link href="/history" />}>Ver mi historial</Button>
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Eliminar entrenamiento</h1>
      {!r.ready ? <p className="text-sm text-muted-foreground">Recuperando eliminación…</p> : null}
      {error ? <Notice>{error}</Notice> : null}
      {r.error && r.error !== error && r.error !== cause ? <Notice>{r.error}</Notice> : null}
      {cause ? <Notice>{cause}</Notice> : null}
      {r.ready && (r.blocked || r.dirty) ? (
        reload ? (
          <>
            <Notice>
              Se reemplazará el intento en memoria por el guardado en este dispositivo. Se perderán
              los cambios que no se pudieron guardar.
            </Notice>
            <Button
              disabled={disabled}
              onClick={() => {
                void run(async () => {
                  await controller.reloadLocal(true);
                  setReload(false);
                });
              }}
            >
              Confirmar relectura de eliminación
            </Button>
            <Button variant="outline" disabled={disabled} onClick={() => setReload(false)}>
              Conservar intento en memoria
            </Button>
          </>
        ) : (
          <Button variant="outline" disabled={disabled} onClick={() => setReload(true)}>
            Releer eliminación local
          </Button>
        )
      ) : null}
      {r.blocked ? (
        <>{own ? <Summary value={own.review} /> : null}</>
      ) : r.pending && !own ? (
        <>
          <Notice>Hay una eliminación pendiente de otro entrenamiento.</Notice>
          <Button render={<Link href={`/history/${r.pending.request.workoutId}/remove`} />}>
            Revisar eliminación pendiente
          </Button>
        </>
      ) : r.ready ? (
        <>
          {value ? <Summary value={value} /> : null}
          {own ? (
            <>
              <p
                aria-label="Estado de eliminación"
                aria-live="polite"
                className="text-sm text-muted-foreground"
              >
                {r.confirmation
                  ? "Servidor confirmado · limpieza local pendiente"
                  : r.dirty
                    ? "Cambios pendientes de guardar en este dispositivo"
                    : "Pendiente de confirmar en el servidor"}
              </p>
              {r.confirmation ? (
                <Button
                  disabled={disabled || correctionBlocked}
                  onClick={() => {
                    void run(() => controller.retry());
                  }}
                >
                  Completar limpieza local
                </Button>
              ) : r.dirty ? (
                <Button
                  variant="outline"
                  disabled={disabled}
                  onClick={() => {
                    void run(() => controller.retryStorage());
                  }}
                >
                  Guardar intento en este dispositivo
                </Button>
              ) : !own.issue ? (
                <Button
                  disabled={disabled || correctionBlocked}
                  onClick={() => {
                    void run(() => controller.retry());
                  }}
                >
                  Reintentar la misma eliminación
                </Button>
              ) : null}
              {own.issue === "conflict" ? (
                <>
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() => {
                      setFetching(true);
                      void run(async () => setLatest(await readRemoval(workoutId))).finally(() =>
                        setFetching(false),
                      );
                    }}
                  >
                    Revisar versión actual
                  </Button>
                  {latest ? (
                    <section className="space-y-3 rounded-lg border p-4">
                      <h3 className="font-medium">Versión actual</h3>
                      <Summary value={latest} />
                      <p className="text-sm">Revisión {latest.workout.revision}</p>
                      <Button
                        disabled={disabled}
                        onClick={() => {
                          void run(async () => {
                            await controller.acceptLatest(latest);
                            setAccepted(latest);
                            setLatest(null);
                          });
                        }}
                      >
                        Aceptar versión actual
                      </Button>
                    </section>
                  ) : null}
                </>
              ) : null}
              {!r.confirmation ? (
                discard ? (
                  <>
                    <Notice>
                      Descartar este intento local no restaura el entrenamiento si el servidor ya lo
                      eliminó.
                    </Notice>
                    <Button
                      variant="destructive"
                      disabled={disabled}
                      onClick={() => {
                        void run(async () => {
                          await controller.discard(true);
                          setFinished(true);
                        });
                      }}
                    >
                      Confirmar descarte del intento
                    </Button>
                    <Button variant="outline" disabled={disabled} onClick={() => setDiscard(false)}>
                      Conservar intento
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" disabled={disabled} onClick={() => setDiscard(true)}>
                    Descartar intento local
                  </Button>
                )
              ) : null}
            </>
          ) : value ? (
            <>
              <p className="text-sm text-muted-foreground">
                Se eliminarán para siempre este entrenamiento, sus series y comentarios.
              </p>
              {!isWorkoutEditable(value.workout.performedOn, value.today) ? (
                <Notice>Terminó el plazo de siete días para eliminar este entrenamiento.</Notice>
              ) : null}
              <Button
                variant="destructive"
                disabled={
                  disabled ||
                  correctionBlocked ||
                  !isWorkoutEditable(value.workout.performedOn, value.today)
                }
                onClick={() => {
                  void run(() => controller.confirm(value));
                }}
              >
                Eliminar para siempre
              </Button>
            </>
          ) : (
            <Notice>{initialError ?? "Ese entrenamiento ya no está disponible."}</Notice>
          )}
          {correctionPending ? (
            <>
              <Notice>
                Retoma o descarta la corrección de este entrenamiento antes de eliminarlo.
              </Notice>
              <Button variant="outline" render={<Link href={`/history/${workoutId}/edit`} />}>
                Retomar corrección
              </Button>
            </>
          ) : c.blocked ? (
            <Notice>
              Recupera la corrección local desde Cuenta antes de eliminar entrenamientos.
            </Notice>
          ) : null}
        </>
      ) : null}
      <Button variant="outline" render={<Link href="/history" />}>
        {own || r.blocked ? "Volver sin descartar" : "Cancelar"}
      </Button>
    </div>
  );
}
