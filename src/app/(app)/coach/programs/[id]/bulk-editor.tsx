"use client";
import { PrescriptionTargets } from "@/components/workout/prescription-targets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildBulkPreview, type BulkDraft } from "@/lib/coach/bulk-editor";
import type { SessionExerciseRow } from "@/lib/data/programs";
import type { PrescriptionDraft } from "@/lib/coach/routine-editor";
import { formatPrescription } from "@/domain/format";
export function BulkEditor({
  rows,
  value,
  disabled,
  onChange,
  onApply,
  onCancel,
}: {
  rows: SessionExerciseRow[];
  value: BulkDraft;
  disabled: boolean;
  onChange: (value: BulkDraft) => void;
  onApply: (rows: PrescriptionDraft[]) => void;
  onCancel: () => void;
}) {
  const preview = buildBulkPreview(rows, value);
  const change = (patch: Partial<BulkDraft>) => onChange({ ...value, ...patch });
  const enabled = value.setsEnabled || value.repsEnabled || value.restEnabled;
  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <legend className="px-1 text-sm font-semibold">
        Edición múltiple · {value.ids.length} ejercicios
      </legend>
      <p className="text-sm text-muted-foreground">
        Elige los campos, revisa la vista previa y aplica al borrador. Después guarda la sesión
        completa.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-11 accent-primary"
              checked={value.setsEnabled}
              onChange={(e) => change({ setsEnabled: e.target.checked })}
            />
            Cambiar series
          </label>
          <Input
            aria-label="Series para la selección"
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            disabled={!value.setsEnabled}
            value={value.sets}
            onChange={(e) => change({ sets: e.target.value })}
          />
        </div>
        <div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-11 accent-primary"
              checked={value.repsEnabled}
              onChange={(e) => change({ repsEnabled: e.target.checked })}
            />
            Cambiar repeticiones
          </label>
          <div className="flex gap-2">
            <Input
              aria-label="Repeticiones mínimas para la selección"
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              disabled={!value.repsEnabled}
              value={value.repsMin}
              onChange={(e) => change({ repsMin: e.target.value })}
            />
            <Input
              aria-label="Repeticiones máximas para la selección"
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              disabled={!value.repsEnabled}
              value={value.repsMax}
              onChange={(e) => change({ repsMax: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-11 accent-primary"
              checked={value.restEnabled}
              onChange={(e) => change({ restEnabled: e.target.checked })}
            />
            Cambiar descanso
          </label>
          <Input
            aria-label="Descanso para la selección (segundos)"
            type="number"
            inputMode="numeric"
            min={0}
            max={600}
            placeholder="Libre"
            disabled={!value.restEnabled}
            value={value.restSeconds}
            onChange={(e) => change({ restSeconds: e.target.value })}
          />
        </div>
      </div>
      {enabled && !preview.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {preview.error}
        </p>
      ) : null}
      {preview.ok ? (
        <div aria-label="Vista previa del lote" role="region" className="space-y-2">
          {preview.changes.map((change) => {
            const row = rows.find((r) => r.id === change.id)!;
            const fields = [];
            if (value.setsEnabled) fields.push(`Series: ${row.sets} → ${change.sets}`);
            if (value.repsEnabled)
              fields.push(
                `Repeticiones: ${row.repsMin}–${row.repsMax} → ${change.repsMin}–${change.repsMax}`,
              );
            if (value.restEnabled)
              fields.push(
                `${row.supersetId ? "Descanso de ronda" : "Descanso"}: ${(row.supersetId ? row.supersetRestSeconds : row.restSeconds) ?? "Libre"} → ${value.restSeconds || "Libre"} s`,
              );
            return (
              <div key={row.id} className="rounded border bg-background p-2 text-sm">
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">Actual: {formatPrescription(row)}</p>
                {row.series ? (
                  <>
                    <p className="mt-2 text-xs">
                      Resultado por serie: se conservan los campos no elegidos. Ampliar replica la
                      última; reducir retira las sobrantes.
                    </p>
                    <PrescriptionTargets series={change.series} />
                  </>
                ) : null}
                {fields.map((text) => (
                  <p key={text}>{text}</p>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!preview.ok}
          onClick={() => {
            if (preview.ok) onApply(preview.changes);
          }}
        >
          Aplicar al borrador
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar edición múltiple
        </Button>
      </div>
    </fieldset>
  );
}
