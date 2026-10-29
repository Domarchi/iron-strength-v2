"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition, type ReactNode } from "react";
import type { ProgressWeeks } from "@/domain/progress-period";
import type { TrainingComparisonMetric } from "@/domain/training-progress";
import { PROGRESS_LABELS } from "@/domain/training-progress-view";
import {
  progressHref,
  progressIndexHref,
  studentHref,
  type TrainingNavigation,
} from "@/lib/navigation/training-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
type Choice = { weeks: ProgressWeeks; metric: TrainingComparisonMetric };
export function TrainingProgressControls({
  exerciseId,
  navigation,
  studentId,
  weeks,
  metric,
  options,
  children,
}: {
  exerciseId: string;
  navigation: TrainingNavigation;
  studentId?: string;
  weeks: ProgressWeeks;
  metric: TrainingComparisonMetric;
  options: TrainingComparisonMetric[];
  children: ReactNode;
}) {
  const router = useRouter(),
    [pending, startTransition] = useTransition(),
    [choice, setChoice] = useOptimistic<Choice>({ weeks, metric });
  const context = (next: Choice): TrainingNavigation => ({
    ...navigation,
    weeks: next.weeks,
    metric: next.metric,
    view: next.metric === "externalVolumeKg" ? "volumen" : navigation.view,
  });
  const href = (next: Choice) => progressHref(exerciseId, context(next), studentId);
  function chooseAction(next: Choice) {
    startTransition(() => {
      setChoice(next);
      router.push(href(next), { scroll: false });
    });
  }
  return (
    <div className="space-y-4">
      <nav aria-label="Periodo de progreso" className="grid grid-cols-3 gap-2">
        {([4, 8, 12] as const).map((period) => {
          const next = { ...choice, weeks: period };
          return (
            <Link
              key={period}
              prefetch={false}
              href={href(next)}
              onNavigate={(event) => {
                event.preventDefault();
                chooseAction(next);
              }}
              aria-current={choice.weeks === period ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 min-w-0 items-center justify-center rounded-full border px-2 text-center text-sm wrap-anywhere",
                choice.weeks === period
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {period} semanas
            </Link>
          );
        })}
      </nav>
      <nav aria-label="Qué mostrar" className="flex flex-wrap gap-2">
        {options.map((m) => {
          const next = { ...choice, metric: m };
          return (
            <Link
              key={m}
              prefetch={false}
              href={href(next)}
              onNavigate={(event) => {
                event.preventDefault();
                chooseAction(next);
              }}
              aria-current={choice.metric === m ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-4 text-sm",
                choice.metric === m
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {PROGRESS_LABELS[m]}
            </Link>
          );
        })}
      </nav>
      <p role="status" className="min-h-4 text-xs text-muted-foreground">
        {pending ? "Actualizando…" : ""}
      </p>
      <div
        inert={pending}
        aria-busy={pending}
        className={cn("space-y-4", pending && "pointer-events-none opacity-60")}
      >
        {children}
      </div>
      <div>
        <Button
          variant="outline"
          render={
            <Link
              href={
                studentId
                  ? studentHref(studentId, context(choice))
                  : progressIndexHref(context(choice))
              }
            />
          }
        >
          {studentId ? "Volver a la ficha" : "Volver"}
        </Button>
      </div>
    </div>
  );
}
