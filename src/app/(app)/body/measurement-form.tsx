"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMeasurementAction, type MeasurementState } from "./actions";

const FIELDS = [
  ["weightKg", "Peso (kg)"],
  ["waistCm", "Cintura (cm)"],
  ["chestCm", "Pecho (cm)"],
  ["armCm", "Brazo (cm)"],
] as const;

export function MeasurementForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<MeasurementState, FormData>(
    saveMeasurementAction,
    { status: "idle" },
  );

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="measuredOn">Fecha</Label>
        <Input
          id="measuredOn"
          name="measuredOn"
          type="date"
          max={today}
          defaultValue={today}
          required
          className="h-11"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(([name, label]) => (
          <div key={name} className="flex flex-col gap-2">
            <Label htmlFor={name}>{label}</Label>
            <Input id={name} name={name} inputMode="decimal" className="h-11" />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Completa solo lo que mediste hoy; basta con una medida.
      </p>

      {state.status === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      {state.status === "saved" ? (
        <p role="status" className="text-sm text-primary">
          {state.message}
        </p>
      ) : null}
      {state.status === "exists" ? (
        <div
          role="alertdialog"
          aria-label="Reemplazar medidas"
          className="flex flex-col gap-2 rounded-lg border p-3"
        >
          <p className="text-sm">
            Ya registraste medidas ese día. ¿Quieres reemplazarlas por estas?
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="replace" value="1" className="size-5" />
            Sí, reemplazar el registro de ese día
          </label>
        </div>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending
          ? "Guardando…"
          : state.status === "exists"
            ? "Guardar con el reemplazo"
            : "Guardar medidas"}
      </Button>
    </form>
  );
}
