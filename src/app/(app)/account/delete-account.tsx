"use client";

import { useActionState, useState } from "react";
import { useWorkoutChanges } from "@/components/workout-changes/provider";
import { useRouter } from "next/navigation";
import { clearLocalAccount } from "@/lib/offline/local-account";
import { setOfflineAccount } from "@/lib/offline/account";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DELETE_CONFIRMATION, isDeleteConfirmation } from "@/domain/account";
import { deleteAccountAction, type DeleteAccountState } from "./actions";

// Borrar mi cuenta (RF-48): zona separada, con lo que se pierde a la vista y una confirmación escrita.
export function DeleteAccount({ userId }: { userId: string }) {
  const router = useRouter();
  const changes = useWorkoutChanges();
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  async function finishCleanup() {
    setCleaning(true);
    try {
      await clearLocalAccount(userId, { afterAccountDeletion: true });
      if (!setOfflineAccount(null)) throw new Error("No se pudo ocultar la cuenta local.");
      router.replace("/login?motivo=cuenta-borrada");
      router.refresh();
    } catch {
      setCleanupError(
        "La cuenta ya fue borrada del servidor, pero no se pudo completar la limpieza de este dispositivo. Reintenta para eliminar sus descargas y borradores locales.",
      );
    } finally {
      setCleaning(false);
    }
  }
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(
    async (previous, form) => {
      let release: (() => void) | undefined;
      try {
        release = await changes.reserveAccountDeletion();
        const result = await deleteAccountAction(previous, form);
        if (result.status === "deleted") await finishCleanup();
        return result;
      } catch (error) {
        return {
          status: "error",
          message:
            error instanceof Error ? error.message : "No pudimos reservar tus cambios locales.",
        };
      } finally {
        release?.();
      }
    },
    { status: "idle" },
  );

  if (state.status === "deleted")
    return (
      <section className="space-y-3">
        <p role="alert">{cleanupError ?? "Limpiando los datos de este dispositivo…"}</p>
        <Button disabled={cleaning} onClick={() => void finishCleanup()}>
          Reintentar limpieza local
        </Button>
      </section>
    );

  return (
    <section
      aria-labelledby="danger-heading"
      className="flex flex-col gap-3 rounded-xl border border-destructive/40 p-4"
    >
      <h2 id="danger-heading" className="text-lg font-medium text-destructive">
        Borrar mi cuenta
      </h2>
      <p className="text-sm text-muted-foreground">
        Se borran para siempre tus entrenamientos, medidas, fotos, logros y los comentarios de tus
        entrenamientos. No se puede deshacer. Antes puedes exportar tu historial.
      </p>

      {!open ? (
        <div>
          <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
            <Trash2 aria-hidden /> Quiero borrar mi cuenta
          </Button>
        </div>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmacion">Para confirmar, escribe {DELETE_CONFIRMATION}</Label>
            <Input
              id="confirmacion"
              name="confirmacion"
              autoComplete="off"
              autoCapitalize="characters"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-11"
            />
          </div>
          {state.status === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="destructive"
              disabled={pending || !isDeleteConfirmation(text)}
            >
              {pending ? "Borrando…" : "Borrar mi cuenta para siempre"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setText("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
