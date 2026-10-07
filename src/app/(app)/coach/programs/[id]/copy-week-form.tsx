"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { copyWeekAction } from "../actions";

export function CopyWeekForm({
  programId,
  toWeek,
  otherWeeks,
  destinationHasSessions,
}: {
  programId: string;
  toWeek: number;
  otherWeeks: number[];
  destinationHasSessions: boolean;
}) {
  const [state, action, pending] = useActionState(copyWeekAction, { error: null });
  if (otherWeeks.length === 0) return null;

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="programId" value={programId} />
      <input type="hidden" name="toWeek" value={toWeek} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`copy-${toWeek}`} className="text-xs">
          Copiar la semana
        </Label>
        <NativeSelect id={`copy-${toWeek}`} name="fromWeek" className="w-28">
          {otherWeeks.map((week) => (
            <option key={week} value={week}>
              {week}
            </option>
          ))}
        </NativeSelect>
      </div>
      {destinationHasSessions ? (
        <label className="flex min-h-11 items-center gap-2 text-xs">
          <input type="checkbox" name="replace" className="size-5" />
          Reemplazar lo que hay
        </label>
      ) : null}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Copiando…" : "Copiar aquí"}
      </Button>
      {state.error ? (
        <p role="alert" className="basis-full text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
