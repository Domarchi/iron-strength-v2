"use client";

import dynamic from "next/dynamic";
import type { ExerciseHistoryPage } from "@/lib/data/exercise-history";
import type { WorkoutContext } from "@/lib/data/workout-context";

// El borrador vive en localStorage: el corredor solo se renderiza en el navegador para que el
// HTML del servidor y el del cliente no difieran.
const Runner = dynamic(() => import("./runner").then((m) => m.WorkoutRunner), {
  ssr: false,
  loading: () => <p className="py-6 text-sm text-muted-foreground">Preparando tu sesión…</p>,
});

export function RunnerLoader(props: {
  userId: string;
  context: WorkoutContext;
  recoveryOnly?: boolean;
  localMode?: boolean;
  downloadedHistory?: Record<string, ExerciseHistoryPage>;
}) {
  return <Runner {...props} />;
}
