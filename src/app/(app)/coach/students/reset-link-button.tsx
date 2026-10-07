"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createResetLinkAction, type ResetLinkState } from "./actions";

export function ResetLinkButton({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  const [state, action, pending] = useActionState<ResetLinkState, FormData>(createResetLinkAction, {
    status: "idle",
  });
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex w-full flex-col gap-2">
      <form action={action}>
        <input type="hidden" name="id" value={studentId} />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Generando…" : "Enlace de contraseña"}
        </Button>
      </form>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      {state.status === "created" ? (
        <div role="status" className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            Enlace para {studentName}: de un solo uso y vence en 24 horas. Se muestra una sola vez.
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={state.link}
              aria-label={`Enlace de restablecimiento de ${studentName}`}
              className="h-11"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(state.link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
