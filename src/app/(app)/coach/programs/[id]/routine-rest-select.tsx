"use client";
import { NativeSelect } from "@/components/ui/native-select";
export function RoutineRestSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  const choices = [
    ...new Set([0, 30, 60, 90, 120, 180, 300, 600, ...(value === null ? [] : [value])]),
  ].sort((a, b) => a - b);
  return (
    <label className="flex min-w-0 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
      Descanso
      <NativeSelect
        aria-label={label}
        value={value === null ? "" : String(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="min-h-11 max-w-44"
      >
        <option value="">Predeterminado</option>
        {choices.map((seconds) => (
          <option key={seconds} value={seconds}>
            {seconds === 0 ? "Sin descanso" : `${seconds} s`}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
