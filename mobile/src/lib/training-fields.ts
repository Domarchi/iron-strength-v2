import type { RecordType } from "../../../src/domain/training-metrics";
import type { TrainingInputField } from "../../../src/domain/training-input";
export function trainingFields(
  kind: RecordType,
): { field: TrainingInputField; label: string; integer?: boolean }[] {
  switch (kind) {
    case "bodyweight_reps":
      return [{ field: "reps", label: "REPS", integer: true }];
    case "duration":
      return [{ field: "duration", label: "SEGUNDOS", integer: true }];
    case "weight_duration":
      return [
        { field: "weight", label: "KG" },
        { field: "duration", label: "SEGUNDOS", integer: true },
      ];
    case "distance_duration":
      return [
        { field: "distance", label: "METROS" },
        { field: "duration", label: "SEGUNDOS", integer: true },
      ];
    case "weight_distance":
      return [
        { field: "weight", label: "KG" },
        { field: "distance", label: "METROS" },
      ];
    case "assisted_bodyweight":
      return [
        { field: "weight", label: "ASIST. KG" },
        { field: "reps", label: "REPS", integer: true },
      ];
    default:
      return [
        { field: "weight", label: kind === "weighted_bodyweight" ? "KG EXTRA" : "KG" },
        { field: "reps", label: "REPS", integer: true },
      ];
  }
}
