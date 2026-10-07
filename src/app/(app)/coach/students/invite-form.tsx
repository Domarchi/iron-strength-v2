"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteStudentAction, type InviteState } from "./actions";

const formatDate = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "long",
  timeZone: "America/Santiago",
});

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteStudentAction, {
    status: "idle",
  });
  const [copied, setCopied] = useState(false);

  async function copy(link: string) {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="invite-email">Correo del alumno</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            className="h-11"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear invitación"}
        </Button>
      </form>

      {state.status === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      {state.status === "created" ? (
        <div role="status" className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
          <p className="text-sm">
            Invitación para <strong>{state.email}</strong>. Vence el{" "}
            {formatDate.format(new Date(state.expiresAt))}.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={state.link} aria-label="Enlace de invitación" className="h-11" />
            <Button type="button" variant="secondary" onClick={() => copy(state.link)}>
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Este enlace se muestra una sola vez: cópialo y envíaselo al alumno.
          </p>
        </div>
      ) : null}
    </div>
  );
}
