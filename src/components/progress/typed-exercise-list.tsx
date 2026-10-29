import Link from "next/link";
import type { TrainingExerciseProgress } from "@/domain/training-progress";
import { RECORD_TYPE_LABELS } from "../../../mobile/src/lib/training-labels";
import {
  availableTrainingMetrics,
  defaultTrainingMetric,
  primaryTrainingMark,
  formatProgressValue,
} from "@/domain/training-progress-view";
import { progressHref, type TrainingNavigation } from "@/lib/navigation/training-context";
const date = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone: "UTC" });
export function TrainingExerciseList({
  exercises,
  navigation,
  studentId,
}: {
  exercises: TrainingExerciseProgress[];
  navigation: TrainingNavigation;
  studentId?: string;
}) {
  return (
    <ul className="flow-list divide-y divide-border/70 overflow-hidden rounded-lg border bg-card">
      {exercises.map((e) => {
        const mark = primaryTrainingMark(e),
          tag = e.recordType ?? "legacy",
          options = availableTrainingMetrics(e),
          metric =
            navigation.recordType === tag &&
            navigation.metric &&
            options.includes(navigation.metric)
              ? navigation.metric
              : navigation.view === "volumen" && options.includes("externalVolumeKg")
                ? "externalVolumeKg"
                : defaultTrainingMetric(e);
        const label =
          e.recordType === null ? "Registro anterior" : RECORD_TYPE_LABELS[e.recordType];
        return (
          <li key={`${e.exerciseId}:${tag}`}>
            <Link
              href={progressHref(
                e.exerciseId,
                { ...navigation, recordType: tag, metric },
                studentId,
              )}
              className="flex min-h-16 flex-col justify-center gap-0.5 p-3 hover:bg-muted/50"
            >
              <span className="font-medium wrap-anywhere">{e.name}</span>
              <span className="text-sm text-muted-foreground wrap-anywhere">
                {label}
                {mark
                  ? ` · ${mark.metric === "assistanceKg" ? "Menor asistencia " : ""}${formatProgressValue(mark.metric, mark.value)}${mark.metric === "assistanceKg" ? ` × ${mark.metrics.reps} reps` : ""}`
                  : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {e.workoutCount} {e.workoutCount === 1 ? "entrenamiento" : "entrenamientos"} ·
                último {date.format(new Date(`${e.lastDate}T00:00:00Z`))}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
