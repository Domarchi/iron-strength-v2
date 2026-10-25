import { z } from "zod";
import type { ProgressMetric, ProgressWeeks } from "../../../src/domain/progress-period";
export function chartCoordinates(values: number[]) {
  if (!values.length) return [];
  const low = Math.min(...values),
    high = Math.max(...values);
  return values.map((value, index) => ({
    x: values.length === 1 ? 150 : 12 + (index / (values.length - 1)) * 276,
    y: high === low ? 85 : 150 - ((value - low) / (high - low)) * 130,
  }));
}
export function progressReturn(
  params: { exercise?: string | string[]; weeks?: string | string[]; metric?: string | string[] },
  exercises: string[],
) {
  if (
    typeof params.exercise !== "string" ||
    !z.uuid().safeParse(params.exercise).success ||
    !exercises.includes(params.exercise) ||
    !["4", "8", "12"].includes(String(params.weeks)) ||
    Array.isArray(params.weeks) ||
    !["1rm", "volume", "reps"].includes(String(params.metric)) ||
    Array.isArray(params.metric)
  )
    return null;
  return {
    exercise: params.exercise,
    weeks: Number(params.weeks) as ProgressWeeks,
    metric: params.metric as ProgressMetric,
  };
}
