type Target = {
  repsMin: number | string;
  repsMax: number | string;
  targetWeightKg: number | string | null;
};
export function PrescriptionTargets({ series }: { series?: readonly Target[] | null }) {
  if (!series) return null;
  return (
    <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
      {series.map((t, index) => (
        <li key={index}>
          Serie {index + 1} ·{" "}
          {String(t.repsMin) === String(t.repsMax) ? t.repsMin : `${t.repsMin}–${t.repsMax}`} reps
          {t.targetWeightKg != null && t.targetWeightKg !== ""
            ? ` · ${String(t.targetWeightKg).replace(".", ",")} kg`
            : " · Peso libre"}
        </li>
      ))}
    </ul>
  );
}
