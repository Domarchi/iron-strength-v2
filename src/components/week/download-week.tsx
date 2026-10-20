"use client";
import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadWeekAction } from "@/app/(app)/week/download-actions";
import { loadWeekPackage, saveWeekPackage } from "@/lib/offline/storage";
const dateFormat = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Santiago",
});
export function DownloadWeek({
  userId,
  programId,
  weekStart,
}: {
  userId: string;
  programId: string;
  weekStart: string;
}) {
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    loadWeekPackage(userId, programId, weekStart)
      .then((p) => {
        if (active) setSavedAt(p?.downloadedAt ?? null);
      })
      .catch(() => {
        if (active)
          setError(
            "No se pudo leer la descarga del dispositivo. Vuelve a descargar para comprobar el almacenamiento.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, programId, weekStart]);
  async function download() {
    setBusy(true);
    setError(null);
    try {
      const result = await downloadWeekAction();
      if (!result.ok) throw new Error(result.error);
      if (result.pack.program.id !== programId || result.pack.weekStart !== weekStart)
        throw new Error("La semana cambió. Actualiza esta pantalla antes de descargar.");
      const saved = await saveWeekPackage(result.pack, userId);
      setSavedAt(saved.downloadedAt);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar la descarga en este dispositivo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Descarga de la semana"
      className="rounded-xl border bg-card p-4 flex flex-col gap-3"
    >
      <div>
        <h2 className="font-semibold">Tu semana en este dispositivo</h2>
        <p className="text-sm text-muted-foreground">
          Guarda rutinas, alternativas y el historial reciente.
        </p>
      </div>
      <p role="status" className="text-sm">
        {busy
          ? "Descargando y comprobando los datos…"
          : loading
            ? "Comprobando descarga…"
            : savedAt
              ? `Datos guardados: ${dateFormat.format(new Date(savedAt))}.`
              : "Todavía no has descargado esta semana."}
      </p>
      <p className="text-xs text-muted-foreground">
        Los datos quedan guardados aquí. Por ahora, necesitas conexión para abrir la app.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        variant="outline"
        disabled={busy || loading}
        onClick={download}
        className="self-start"
      >
        {savedAt ? (
          <RefreshCw aria-hidden className="size-4" />
        ) : (
          <Download aria-hidden className="size-4" />
        )}
        {busy ? "Descargando…" : savedAt ? "Actualizar descarga" : "Descargar semana"}
      </Button>
    </section>
  );
}
