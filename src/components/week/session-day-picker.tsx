"use client";
import { StatusMessage } from "@/components/ui/status-message";
import { NativeSelect } from "@/components/ui/native-select";
import { CalendarDays } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { WEEKDAYS } from "@/domain/session-schedule";
import { moveDayAction } from "@/app/(app)/week/actions";
export function SessionDayPicker({
  sessionId,
  label,
  prescribed,
  override,
  compact = false,
}: {
  compact?: boolean;
  sessionId: string;
  label: string;
  prescribed: number | null;
  override: number | null;
}) {
  const [value, setValue] = useState(override === null ? "coach" : String(override));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  return (
    <details
      className={
        compact
          ? "session-day-picker session-day-picker-compact"
          : "session-day-picker mt-3 border-t pt-1"
      }
    >
      <summary
        aria-label={`Cambiar día de sesión ${label}`}
        className="min-h-11 cursor-pointer py-3 text-sm font-medium text-primary"
      >
        {compact ? <CalendarDays className="size-5" aria-hidden /> : null}
        <span className={compact ? "compact-day-label" : undefined}>
          Cambiar día de sesión {label}
        </span>
      </summary>
      <p className="mb-2 text-xs text-muted-foreground">
        Puedes entrenar cualquier día de esta semana.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Día de sesión {label}
        <NativeSelect
          aria-label={`Día de sesión ${label}`}

          value={value}
          disabled={pending}
          onChange={(e) => {
            setValue(e.target.value);
            setMessage(null);
          }}
        >
          <option value="coach">Sugerido: {WEEKDAYS[prescribed ?? -1] ?? "sin día"}</option>
          {WEEKDAYS.map((day, i) => (
            <option value={i} key={day}>
              {day}
            </option>
          ))}
        </NativeSelect>
      </label>
      <Button
        className="mt-2 w-full"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const result = await moveDayAction(
                sessionId,
                value === "coach" ? null : Number(value),
              );
              setMessage({ error: !!result.error, text: result.error ?? "Día guardado." });
            } catch {
              setMessage({
                error: true,
                text: "No se pudo confirmar el día. Reintenta cuando tengas conexión.",
              });
            }
          })
        }
      >
        {pending ? "Guardando…" : "Guardar día"}
      </Button>
      {message ? (
        <StatusMessage error={message.error} className="mt-2">
          {message.text}
        </StatusMessage>
      ) : null}
    </details>
  );
}
