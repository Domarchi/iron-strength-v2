"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DELETE_CONFIRMATION, isDeleteConfirmation } from "@/domain/account";
import { deleteAccountAction, type DeleteAccountState } from "./actions";

// Borrar mi cuenta (RF-48): zona separada, con lo que se pierde a la vista y una confirmación escrita.
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(
    deleteAccountAction,
    { status: "idle" },
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
