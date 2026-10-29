"use client";
import { useRef, useState, useId } from "react";
import { useWorkoutChanges } from "@/components/workout-changes/provider";
import { useWebTraining } from "@/components/training/provider";
import { logoutAction } from "@/app/(auth)/actions";
import { setOfflineAccount } from "@/lib/offline/account";
import { clearLocalAccount, inspectLocalAccount } from "@/lib/offline/local-account";
import { syncAllWorkouts } from "@/lib/offline/sync";
import { Button } from "@/components/ui/button";
export function LogoutForm({ children, userId }: { children: React.ReactNode; userId: string }) {
  const changes = useWorkoutChanges();
  const { bridge } = useWebTraining();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState(
    "Hay entrenamientos o ediciones sin confirmar en este dispositivo.",
  );
  async function leave() {
    await clearLocalAccount(userId);
    if (!setOfflineAccount(null))
      throw new Error("No se pudo ocultar la cuenta local. No cerramos la sesión; reintenta.");
    await logoutAction();
  }
  async function attempt(mode: "inspect" | "sync" | "discard") {
    setBusy(true);
    setError(null);
    let release: (() => void) | undefined;
    let releaseTraining: (() => void) | undefined;
    try {
      release = await changes.reserveExit();
      releaseTraining = await bridge.reserve(mode);
      if (mode === "discard") {
        await leave();
        return;
      }
      if (mode === "sync") await syncAllWorkouts(userId);
      const state = await inspectLocalAccount(userId);
      if (!state.pending) {
        await leave();
        return;
      }
      setMessage(
        mode === "sync"
          ? "Aún quedan registros pendientes o ediciones del coach. Vuelve para completarlos o confirma su eliminación local."
          : "Hay entrenamientos o ediciones sin confirmar en este dispositivo. Cerrar sesión elimina las descargas de esta cuenta.",
      );
      dialog.current?.showModal();
    } catch (e) {
      // Las redirecciones de server actions deben conservar su navegación.
      if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo comprobar el almacenamiento. Conservamos tu sesión y tus datos.",
      );
      dialog.current?.showModal();
    } finally {
      release?.();
      releaseTraining?.();
      setBusy(false);
    }
  }
  return (
    <>
      <form data-local-exit action={() => attempt("inspect")}>
        <fieldset disabled={busy}>{children}</fieldset>
      </form>
      <dialog
        ref={dialog}
        aria-labelledby={title}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border bg-card p-5 text-foreground shadow-xl backdrop:bg-black/50"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <div className="space-y-4">
          <h2 id={title} className="text-lg font-semibold">
            Antes de cerrar sesión
          </h2>
          <p className="text-sm">{message}</p>
          <p className="text-sm text-muted-foreground">
            Sincronizar solo envía entrenamientos terminados. Eliminar aquí no borra lo que ya está
            guardado en tu cuenta.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive wrap-anywhere">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Button disabled={busy} onClick={() => void attempt("sync")}>
              {busy ? "Comprobando…" : "Sincronizar y salir"}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => dialog.current?.close()}>
              Volver sin cerrar sesión
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void attempt("discard")}>
              Eliminar pendientes locales y salir
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
