"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "./actions";

// Botón de un solo clic que ejecuta una server action con campos ocultos y muestra su error.
export function ActionForm({
  action,
  fields,
  label,
  pendingLabel,
  variant = "outline",
  confirm,
  ariaLabel,
  disabled,
  size,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: React.ReactNode;
  pendingLabel?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  confirm?: string;
  ariaLabel?: string;
  disabled?: boolean;
  size?: "default" | "icon";
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className="flex flex-col gap-1"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button
        type="submit"
        variant={variant}
        size={size}
        disabled={pending || disabled}
        aria-label={ariaLabel}
      >
        {pending && pendingLabel ? pendingLabel : label}
      </Button>
      {state.error ? (
        <p role="alert" className="max-w-xs text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
