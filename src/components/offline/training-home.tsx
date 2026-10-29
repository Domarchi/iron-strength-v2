"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useWebTrainingDownload } from "./training-download-provider";
import { WebDownloadCard } from "./training-download-card";
import { useWebTraining } from "@/components/training/provider";
import { TypedPendingTraining } from "@/components/training/pending";
import { TypedWebWorkout } from "@/components/training/workout";
import { isTypedTraining } from "../../../mobile/src/lib/training";
import { LegacyOfflineWeeks } from "./legacy-offline-weeks";
import { SyncWorkouts } from "./sync-workouts";
import { verifiedDownloadedTraining } from "../../../mobile/src/lib/downloaded-training";
import {
  downloadedAssignedContext,
  downloadedFreeContext,
  downloadedPersonalContext,
} from "@/lib/offline/web-downloaded-training";
import { hasPreviousTraining } from "@/lib/workout/training-guard";
import { santiagoDate } from "@/domain/dates";
import { assignedCanStart, type AssignedTrainingContext } from "@/lib/workout/training-context";
import type { TypedPersonalRoutine } from "@/lib/mobile/typed-personal-contracts";
import { formatTrainingTarget } from "../../../mobile/src/lib/training-labels";
import { Input } from "@/components/ui/input";
import { DownloadedExerciseHistory } from "@/components/training/downloaded-history";
type Preview =
  | { kind: "assigned"; context: AssignedTrainingContext }
  | { kind: "personal"; routine: TypedPersonalRoutine };
export function OfflineTrainingHome({ userId }: { userId: string }) {
  const { bridge: downloads, download, bundle } = useWebTrainingDownload();
  const { bridge, training, queue, reservation } = useWebTraining();
  const [view, setView] = useState<"home" | "training" | "legacy">(() => {
    if (typeof window === "undefined") return "home";
    const q = new URL(window.location.href).searchParams;
    return q.has("session") ? "legacy" : q.has("training") ? "training" : "home";
  });
  const [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [catalog, setCatalog] = useState(false),
    [search, setSearch] = useState(""),
    [exercise, setExercise] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (preview) dialog.current?.showModal();
    else dialog.current?.close();
  }, [preview]);
  function navigate(next: "home" | "training" | "legacy") {
    if (next !== "legacy")
      history.replaceState(null, "", next === "training" ? "/offline?training=1" : "/offline");
    setView(next);
  }
  const active = training.active;
  const disabled =
    busy ||
    !training.ready ||
    !queue.ready ||
    training.blocked ||
    queue.blocked ||
    !queue.verified ||
    reservation.reserved ||
    download.busy ||
    download.reserved ||
    !!active;
  async function start(choice: Preview | null) {
    setBusy(true);
    setError(null);
    try {
      if (hasPreviousTraining(localStorage, userId))
        throw Error("Retoma o resuelve los borradores anteriores antes de comenzar otra sesión.");
      const current = await verifiedDownloadedTraining(downloads.controller);
      const context = !choice
        ? downloadedFreeContext(current, userId)
        : choice.kind === "assigned"
          ? downloadedAssignedContext(
              current,
              userId,
              choice.context.session.id,
              santiagoDate(new Date()),
            )
          : downloadedPersonalContext(current, userId, choice.routine);
      await bridge.perform((c) => c.startTyped(context));
      setPreview(null);
      navigate("training");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar. Conservamos tus registros.");
    } finally {
      setBusy(false);
    }
  }
  if (!training.ready || !queue.ready || !download.ready)
    return (
      <p role="status" className="py-8">
        Recuperando entrenamientos…
      </p>
    );
  if (view === "training" && active && isTypedTraining(active))
    return <TypedWebWorkout active={active} local={{ onHome: () => navigate("home"), bundle }} />;
  if (
    view === "legacy" &&
    !active &&
    !training.blocked &&
    !queue.blocked &&
    !queue.entries.some((e) => e.phase === "pending")
  )
    return <LegacyOfflineWeeks userId={userId} />;
  return (
    <div className="py-6 space-y-5">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Iron Strength · Este dispositivo
        </p>
        <h1 className="text-2xl font-semibold">Entrena sin conexión</h1>
      </header>
      <SyncWorkouts userId={userId} localMode />
      <TypedPendingTraining local={{ onResume: () => navigate("training") }} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!bundle ? <WebDownloadCard localMode /> : null}
      {bundle ? (
        <>
          <section aria-label="Sesiones asignadas descargadas" className="space-y-3">
            <h2 className="text-lg font-semibold">
              {bundle.week?.program.name ?? "Sin programa asignado"}
            </h2>
            {bundle.week?.sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Semana sin sesiones previstas.</p>
            ) : null}
            {bundle.week?.sessions.map(({ context }) => (
              <div key={context.session.id} className="rounded-xl border bg-card p-4 space-y-2">
                <h3 className="font-medium">
                  Sesión {context.session.label}
                  {context.title ? ` · ${context.title}` : ""}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {context.exercises.length} ejercicios ·{" "}
                  {context.exercises.reduce((n, e) => n + e.prescribed.sets, 0)} series
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setError(null);
                    setPreview({ kind: "assigned", context });
                  }}
                >
                  Ver sesión {context.session.label}
                </Button>
              </div>
            ))}
          </section>
          <section aria-label="Rutinas personales descargadas" className="space-y-3">
            <h2 className="text-lg font-semibold">Mis rutinas</h2>
            {!bundle.library.routines.length ? (
              <p className="text-sm text-muted-foreground">
                No había rutinas personales al descargar.
              </p>
            ) : (
              bundle.library.routines.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border bg-card p-4 flex items-center justify-between gap-3"
                >
                  <div>
                    <h3 className="font-medium">{r.name}</h3>
                    <p className="text-sm text-muted-foreground">{r.items.length} ejercicios</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setError(null);
                      setPreview({ kind: "personal", routine: r });
                    }}
                  >
                    Ver rutina {r.name}
                  </Button>
                </div>
              ))
            )}
          </section>
          <Button
            disabled={disabled || !bundle.catalog.exercises.length}
            onClick={() => void start(null)}
          >
            Empezar entrenamiento libre
          </Button>
          <WebDownloadCard localMode />
          <section className="space-y-3">
            <Button variant="ghost" aria-expanded={catalog} onClick={() => setCatalog((v) => !v)}>
              Catálogo descargado ({bundle.catalog.exercises.length})
            </Button>
            {catalog ? (
              <>
                <Input
                  aria-label="Buscar en catálogo descargado"
                  value={search}
                  placeholder="Buscar ejercicio"
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="max-h-80 overflow-y-auto space-y-1">
                  {bundle.catalog.exercises
                    .filter((e) =>
                      e.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")),
                    )
                    .map((e) => (
                      <div key={e.id} className="border-b py-2">
                        <Button
                          variant="link"
                          onClick={() => setExercise(exercise === e.id ? null : e.id)}
                        >
                          {e.name}
                        </Button>
                        {exercise === e.id ? (
                          <DownloadedExerciseHistory
                            detail={bundle.history[e.id]}
                            downloadedAt={bundle.downloadedAt}
                          />
                        ) : null}
                      </div>
                    ))}
                </div>
              </>
            ) : null}
          </section>
        </>
      ) : null}
      <LegacyOfflineWeeks
        userId={userId}
        compact
        blocked={
          !!active ||
          training.blocked ||
          queue.blocked ||
          queue.entries.some((e) => e.phase === "pending")
        }
        onStart={() => navigate("legacy")}
      />
      <Button variant="outline" render={<a href="/week" />}>
        Abrir Mi semana con conexión
      </Button>
      <dialog
        ref={dialog}
        aria-label="Vista previa de rutina descargada"
        onCancel={() => setPreview(null)}
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border bg-card p-5 text-foreground backdrop:bg-black/50"
      >
        {preview ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">
              {preview.kind === "personal"
                ? preview.routine.name
                : (preview.context.title ?? `Sesión ${preview.context.session.label}`)}
            </h2>
            <ul className="space-y-3">
              {(preview.kind === "personal"
                ? preview.routine.items
                : preview.context.exercises
              ).map((e, i) => (
                <li key={i}>
                  <p className="font-medium">{e.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {e.prescribed.sets} series · {formatTrainingTarget(e.prescribed.target)}
                  </p>
                  {e.prescribed.series ? (
                    <ol className="mt-1 space-y-1 text-sm text-muted-foreground">
                      {e.prescribed.series.map((target, index) => (
                        <li key={index}>
                          Serie {index + 1} · {formatTrainingTarget(target)}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </li>
              ))}
            </ul>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button
              disabled={
                disabled ||
                (preview.kind === "assigned" &&
                  !assignedCanStart(preview.context, userId, santiagoDate(new Date())))
              }
              aria-label="Empezar rutina descargada"
              onClick={() => void start(preview)}
            >
              Empezar
            </Button>
            <Button
              variant="outline"
              aria-label="Cerrar vista previa"
              onClick={() => setPreview(null)}
            >
              Cerrar
            </Button>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
