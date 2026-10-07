"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { assignProgramAction } from "../actions";

export type AssignTarget = { id: string; label: string };

export function AssignForm({
  templateId,
  targets,
  defaultStartDate,
}: {
  templateId: string;
  targets: AssignTarget[];
  defaultStartDate: string;
}) {
  const [state, action, pending] = useActionState(assignProgramAction, { error: null });

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
      <input type="hidden" name="templateId" value={templateId} />
      <div className="flex min-w-48 flex-1 flex-col gap-2">
        <Label htmlFor="assign-student">Alumno</Label>
        <NativeSelect id="assign-student" name="studentId" required>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="assign-start">Inicio</Label>
        <Input
          id="assign-start"
          name="startDate"
          type="date"
          defaultValue={defaultStartDate}
          required
          className="h-11"
        />
      </div>
      <Button type="submit" disabled={pending || targets.length === 0}>
        {pending ? "Asignando…" : "Asignar"}
      </Button>
      <p className="text-xs text-muted-foreground sm:basis-full">
        La semana 1 empieza siempre un lunes: si eliges otro día se usa el lunes de esa semana. El
        alumno recibe una copia independiente; editar esta plantilla después no la cambia.
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive sm:basis-full">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
