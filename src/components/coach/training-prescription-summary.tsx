import type { TrainingPrescription, TrainingTarget } from "@/domain/training-metrics";
import { formatKg, formatReps } from "@/domain/format";
import { formatDistance } from "@/domain/training-tools";
import {
  parsePrescriptionInput,
  prescriptionInputFields,
  type PrescriptionInput,
} from "@/domain/prescription-input";
import type { CoachPrescriptionChanges } from "@/domain/coach-session-mutation";
export function CoachChangesSummary({ changes }: { changes: CoachPrescriptionChanges }) {
  const fields = [
    ["sets", "Series", ""],
    ["repsMin", "Reps mín.", ""],
    ["repsMax", "Reps máx.", ""],
    ["targetWeightKg", "Peso", " kg"],
    ["targetDurationSeconds", "Tiempo", " s"],
    ["targetDistanceMeters", "Distancia", " m"],
  ] as const;
  return (
    <div className="text-xs text-muted-foreground">
      {fields
        .filter(([key]) => Object.hasOwn(changes, key))
        .map(([key, label, unit]) => (
          <p key={key}>
            {label}:{" "}
            {changes[key] === null ? "Libre" : `${String(changes[key]).replace(".", ",")}${unit}`}
          </p>
        ))}
    </div>
  );
}
export function trainingTargetLabel(target: TrainingTarget): string {
  return (
    [
      target.repsMin === null || target.repsMax === null
        ? null
        : `${formatReps(target.repsMin, target.repsMax)} reps`,
      target.targetWeightKg === null ? null : formatKg(target.targetWeightKg),
      target.targetDurationSeconds === null ? null : `${target.targetDurationSeconds} s`,
      target.targetDistanceMeters === null
        ? null
        : formatDistance(target.targetDistanceMeters, "m"),
    ]
      .filter((value) => value !== null)
      .join(" · ") || "Objetivo libre"
  );
}
export function TrainingPrescriptionSummary({ prescribed }: { prescribed: TrainingPrescription }) {
  return (
    <div className="text-xs text-muted-foreground">
      <p>
        {prescribed.sets} {prescribed.sets === 1 ? "serie" : "series"}
        {prescribed.series
          ? " · Objetivos por serie"
          : ` · ${trainingTargetLabel(prescribed.target)}`}
      </p>
      {prescribed.series ? (
        <ol className="mt-1 space-y-1">
          {prescribed.series.map((target, i) => (
            <li key={i}>
              Serie {i + 1} · {trainingTargetLabel(target)}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
function prepared(input: PrescriptionInput): TrainingPrescription | null {
  try {
    return parsePrescriptionInput(input);
  } catch {
    return null;
  }
}
export function RawGoalSummary({ input }: { input: PrescriptionInput }) {
  const prescribed = prepared(input);
  if (prescribed) return <TrainingPrescriptionSummary prescribed={prescribed} />;
  const targets = input.mode === "series" ? input.series : [input.target];
  return (
    <div className="text-xs text-muted-foreground">
      <p>
        {input.mode === "series" ? input.series.length : input.sets || "Cantidad pendiente"} series
        · Valores por completar
      </p>
      {targets.map((target, i) => (
        <p key={i}>
          {input.mode === "series" ? `Serie ${i + 1}: ` : ""}
          {prescriptionInputFields(input.recordType)
            .map((key) => target[key] || "Pendiente")
            .join(" · ")}
        </p>
      ))}
    </div>
  );
}
