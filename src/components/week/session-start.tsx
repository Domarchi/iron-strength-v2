"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listDrafts } from "@/lib/workout/draft";
import { localAssignedTrainings } from "@/lib/workout/local-typed-training";

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener("focus", notify);
  window.addEventListener("offline-queue", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener("focus", notify);
    window.removeEventListener("offline-queue", notify);
  };
}
export function SessionStart({
  userId,
  sessionId,
  featured = false,
}: {
  userId: string;
  sessionId: string;
  featured?: boolean;
}) {
  const status = useSyncExternalStore(
    subscribe,
    () => {
      try {
        const typed = localAssignedTrainings(window.localStorage, userId).find(
          (r) => r.sessionId === sessionId,
        );
        if (typed) return `${typed.phase}:${typed.workoutId}`;
        const found = listDrafts(window.localStorage, userId).find(
          (d) => d.plannedSessionId === sessionId,
        );
        return found ? `${found.status}:${found.workoutId}` : "new";
      } catch {
        return "new";
      }
    },
    () => "new",
  );
  const [phase, workoutId] = status.split(":");
  if (phase === "pending_save")
    return (
      <Button
        variant="ghost"
        className={featured ? "mt-4 w-full" : "px-1"}
        render={<a href={`#pending-${workoutId}`} />}
      >
        Ver envío pendiente
      </Button>
    );
  const label = phase === "in_progress" ? "Retomar" : "Empezar";
  return (
    <div className={featured ? "mt-4" : undefined}>
      {status !== "new" ? (
        <p className={`mb-2 text-xs ${featured ? "text-blue-100" : "text-muted-foreground"}`}>
          {phase === "in_progress"
            ? "En curso · guardado en este dispositivo"
            : "Terminada · pendiente de enviar"}
        </p>
      ) : null}
      <Button
        variant={featured ? "default" : "ghost"}
        className={featured ? "w-full justify-between" : "px-1"}
        aria-label={label}
        render={<Link href={`/workout/${sessionId}`} />}
      >
        {featured && status === "new" ? "Empezar entrenamiento" : label}
        <ChevronRight className="size-5" aria-hidden />
      </Button>
    </div>
  );
}
