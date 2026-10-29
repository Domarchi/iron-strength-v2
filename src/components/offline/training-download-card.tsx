"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status-message";
import { isCompleteOfflineInterfaceReady } from "@/lib/offline/interface";
import { listWeekPackages } from "@/lib/offline/storage";
import { useWebTrainingDownload } from "./training-download-provider";
export function WebDownloadCard({
  expected,
  localMode = false,
}: {
  expected?: { programId: string; weekStart: string };
  localMode?: boolean;
}) {
  const { bridge, download, bundle, owns } = useWebTrainingDownload();
  const [ready, setReady] = useState(false),
    [details, setDetails] = useState(false),
    [remove, setRemove] = useState(false);
  useEffect(() => {
    let live = true;
    void isCompleteOfflineInterfaceReady()
      .then((value) => {
        if (live) setReady(value);
      })
      .catch(() => {
        if (live) setReady(false);
      });
    return () => {
      live = false;
    };
  }, [bundle?.downloadedAt, download.busy]);
  const [oldAt, setOldAt] = useState<string | null>(null),
    [oldError, setOldError] = useState(false);
  useEffect(() => {
    let live = true;
    void listWeekPackages(bridge.controller.userId)
      .then((packs) => {
        if (live) {
          setOldAt(
            packs
              .map((p) => p.downloadedAt)
              .sort()
              .at(-1) ?? null,
          );
          setOldError(false);
        }
      })
      .catch(() => {
        if (live) setOldError(true);
      });
    return () => {
      live = false;
    };
  }, [bridge]);
  const disabled = !owns || !download.ready || download.busy || download.reserved;
  const mismatch =
    bundle &&
    expected &&
    (bundle.week?.program.id !== expected.programId ||
      bundle.week?.weekStart !== expected.weekStart);
  if (!owns) return null;
  return (
    <section
      aria-label="Entrenamientos sin conexión"
      className="rounded-xl border bg-card p-4 space-y-3"
    >
      <h2 className="font-semibold">Sin conexión</h2>
      <p role="status" className="text-sm text-muted-foreground">
        {download.busy
          ? "Comprobando descarga…"
          : !download.ready
            ? "Recuperando descarga…"
            : bundle
              ? `${ready ? "Disponible sin conexión" : "Datos guardados"} · ${new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(bundle.downloadedAt))}`
              : oldAt
                ? `Copia anterior · ${new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(oldAt))}`
                : "Descarga tus entrenamientos para usarlos sin Internet."}
      </p>
      {mismatch ? (
        <p className="text-sm text-muted-foreground">
          La copia tiene otra semana. Actualiza tu planificación.
        </p>
      ) : null}
      {oldError ? (
        <StatusMessage error>
          Conservamos una copia anterior que no pudimos verificar.
        </StatusMessage>
      ) : null}
      {download.error ? <StatusMessage error>{download.error.message}</StatusMessage> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={disabled || download.blocked}
          aria-label={bundle ? "Actualizar entrenamientos descargados" : "Descargar entrenamientos"}
          onClick={() => void bridge.controller.download()}
        >
          {bundle ? "Actualizar" : "Descargar"}
        </Button>
        {!localMode && ((bundle && ready) || (owns && oldAt)) ? (
          <Button
            variant="outline"
            aria-label={
              bundle && ready ? "Abrir entrenamientos descargados" : "Abrir copia anterior"
            }
            render={<a href="/offline" />}
          >
            {bundle && ready ? "Abrir" : "Copia anterior"}
          </Button>
        ) : null}
        {download.blocked || (download.ready && !download.verified) ? (
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => void bridge.controller.restore()}
          >
            Comprobar descarga
          </Button>
        ) : null}
      </div>
      {bundle ? (
        <>
          <Button
            variant="ghost"
            aria-expanded={details}
            onClick={() => {
              setDetails((v) => !v);
              setRemove(false);
            }}
          >
            Detalles de descarga
          </Button>
          {details ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                {bundle.catalog.exercises.length} ejercicios · {bundle.library.routines.length}{" "}
                rutinas · {bundle.week?.sessions.length ?? 0} sesiones asignadas
              </p>
              <p>
                Incluye alternativas e historial reciente. Las sesiones asignadas se inician durante
                su semana.
              </p>
              {remove ? (
                <div className="space-y-2">
                  <p>
                    ¿Eliminar esta descarga? Conservaremos los entrenamientos en curso y pendientes.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      disabled={disabled}
                      onClick={() =>
                        void bridge.controller.remove().then((ok) => {
                          if (ok) setRemove(false);
                        })
                      }
                    >
                      Confirmar eliminación de descarga
                    </Button>
                    <Button variant="ghost" onClick={() => setRemove(false)}>
                      Conservar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" disabled={disabled} onClick={() => setRemove(true)}>
                  Eliminar descarga
                </Button>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
