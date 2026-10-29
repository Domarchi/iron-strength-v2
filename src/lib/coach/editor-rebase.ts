import {
  prescriptionToInput,
  type PrescriptionInput,
  type PrescriptionTargetInput,
} from "@/domain/prescription-input";
import {
  coachRowEditSchema,
  type CoachPrescriptionRow,
  type CoachRowEdit,
} from "./typed-prescription";
const fields = [
  "repsMin",
  "repsMax",
  "targetWeightKg",
  "targetDurationSeconds",
  "targetDistanceMeters",
] as const;
const mergeTarget = (
  base: PrescriptionTargetInput,
  local: PrescriptionTargetInput,
  current: PrescriptionTargetInput,
): PrescriptionTargetInput =>
  Object.fromEntries(
    fields.map((key) => [key, local[key] !== base[key] ? local[key] : current[key]]),
  ) as PrescriptionTargetInput;
function targets(input: PrescriptionInput): PrescriptionTargetInput[] {
  return input.mode === "series"
    ? input.series
    : Array.from({ length: Number(input.sets) }, () => input.target);
}
/** Apply only local differences against their recorded base; caller shows this proposal before approval. */
export function mergeCoachRowEdit(
  base: CoachPrescriptionRow | null,
  current: CoachPrescriptionRow,
  input: CoachRowEdit,
): CoachRowEdit {
  const edit = coachRowEditSchema.parse(input);
  if (
    edit.id !== current.id ||
    edit.exerciseId !== current.exerciseId ||
    (base && (base.id !== current.id || base.exerciseId !== current.exerciseId))
  )
    throw Error("El ejercicio cambió o fue retirado.");
  if (edit.targets?.kind !== "replace") return edit;
  const local = edit.targets.input;
  if (
    local.recordType !== current.prescribed.recordType ||
    (base && base.prescribed.recordType !== current.prescribed.recordType)
  )
    throw Error("El tipo del ejercicio cambió.");
  // An earlier envelope without its base remains a full replacement, explicitly disclosed by review.
  if (!base) return edit;
  const original = prescriptionToInput(base.prescribed),
    latest = prescriptionToInput(current.prescribed);
  if (original.mode !== local.mode) return edit;
  if (original.mode === "uniform" && local.mode === "uniform") {
    const countChanged = local.sets !== original.sets;
    if (latest.mode === "uniform")
      return {
        ...edit,
        targets: {
          kind: "replace",
          input: {
            ...latest,
            sets: countChanged ? local.sets : latest.sets,
            target: mergeTarget(original.target, local.target, latest.target),
          },
        },
      };
    if (
      countChanged &&
      (!/^\d+$/.test(local.sets.trim()) || Number(local.sets) < 1 || Number(local.sets) > 10)
    )
      throw Error("Completa la cantidad de series antes de combinar con el detalle actual.");
    return {
      ...edit,
      targets: {
        kind: "replace",
        input: {
          ...latest,
          series: Array.from(
            { length: countChanged ? Number(local.sets) : latest.series.length },
            (_, i) =>
              mergeTarget(
                original.target,
                local.target,
                latest.series[Math.min(i, latest.series.length - 1)],
              ),
          ),
        },
      },
    };
  }
  if (original.mode === "series" && local.mode === "series") {
    const currentTargets = targets(latest);
    const length =
      local.series.length !== original.series.length ? local.series.length : currentTargets.length;
    return {
      ...edit,
      targets: {
        kind: "replace",
        input: {
          mode: "series",
          recordType: latest.recordType,
          series: Array.from({ length }, (_, i) => {
            const currentTarget = currentTargets[Math.min(i, currentTargets.length - 1)];
            return i >= local.series.length
              ? { ...currentTarget }
              : mergeTarget(
                  original.series[Math.min(i, original.series.length - 1)],
                  local.series[i],
                  currentTarget,
                );
          }),
        },
      },
    };
  }
  return edit;
}
