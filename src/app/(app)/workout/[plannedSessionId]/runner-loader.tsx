"use client";

import { useEffect, useState } from "react";
import { ensureWorkoutInterface } from "@/lib/offline/interface";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import type { ExerciseHistoryPage } from "@/lib/data/exercise-history";
import type { WorkoutContext } from "@/lib/data/workout-context";

// El borrador vive en localStorage: el corredor solo se renderiza en el navegador para que el
// HTML del servidor y el del cliente no difieran.
const Runner = dynamic(() => import("./runner").then((m) => m.WorkoutRunner), {
  ssr: false,
  loading: () => <p className="py-6 text-sm text-muted-foreground">Preparando tu sesión…</p>,
});

type Props = {
  userId: string;
  context: WorkoutContext;
  recoveryOnly?: boolean;
  localMode?: boolean;
  downloadedHistory?: Record<string, ExerciseHistoryPage>;
};
export function RunnerLoader(props: Props) {
  return (
    <RunnerBoot
      key={`${props.userId}:${props.context.session.id}:${props.localMode ? "local" : "online"}`}
      {...props}
    />
  );
}
function RunnerBoot(props: Props) {
  const [ready, setReady] = useState(!!props.localMode);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { userId, localMode, context } = props;
  const sessionId = context.session.id;
  useEffect(() => {
    if (localMode) return;
    let active = true;
    ensureWorkoutInterface(userId, sessionId)
      .then(() => {
        if (active) setReady(true);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo comprobar la versión local. Tus borradores se conservan.",
          );
      });
    return () => {
      active = false;
    };
  }, [userId, sessionId, localMode, attempt]);
  if (ready) return <Runner {...props} />;
  return (
    <div className="space-y-4 py-6">
      <p role={error ? "alert" : "status"}>
        {error ?? "Comprobando la interfaz para proteger tu registro…"}
      </p>
      {error ? (
        <>
          <Button
            onClick={() => {
              setError(null);
              setAttempt((a) => a + 1);
            }}
          >
            Reintentar preparación
          </Button>
          <Button variant="outline" render={<a href="/week" />}>
            Volver a mi semana
          </Button>
        </>
      ) : null}
    </div>
  );
}
