"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTemplateAction } from "./actions";

export function NewProgramForm() {
  const [state, action, pending] = useActionState(createTemplateAction, { error: null });

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="program-name">Nombre</Label>
        <Input id="program-name" name="name" required maxLength={100} className="h-11" />
      </div>
      <div className="flex flex-col gap-2 sm:w-32">
        <Label htmlFor="program-weeks">Semanas</Label>
        <Input
          id="program-weeks"
          name="weeksCount"
          type="number"
          inputMode="numeric"
          min={1}
          max={16}
          defaultValue={4}
          required
          className="h-11"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear plantilla"}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive sm:basis-full">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
