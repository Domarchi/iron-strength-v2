"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAction, type RegisterState } from "./actions";

export function RegisterForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction, {
    error: null,
    name: "",
  });

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" type="email" value={email} readOnly className="h-11" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Tu nombre</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          defaultValue={state.name}
          required
          className="h-11"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-describedby="password-hint"
          className="h-11"
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          Mínimo 8 caracteres.
        </p>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creando cuenta…" : "Crear mi cuenta"}
      </Button>
    </form>
  );
}
