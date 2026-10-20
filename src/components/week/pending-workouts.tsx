"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listDrafts, type WorkoutDraft } from "@/lib/workout/draft";

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

function snapshot(userId: string): string {
  try {
    return JSON.stringify(listDrafts(window.localStorage, userId));
  } catch {
    return "[]";
  }
}

export function PendingWorkouts({ userId }: { userId: string }) {
  const raw = useSyncExternalStore(
    subscribe,
    () => snapshot(userId),
    () => "[]",
  );
  const drafts = JSON.parse(raw) as WorkoutDraft[];
  if (drafts.length === 0) return null;
  return (
    <section
      aria-label="Entrenamientos en este dispositivo"
      className="rounded-xl border border-primary/30 bg-primary/5 p-4"
    >
      <div className="mb-3 flex items-center gap-2 font-semibold">
        <CloudUpload className="size-5 text-primary" aria-hidden />
        Tienes entrenamientos por retomar
      </div>
      <ul className="flex flex-col gap-3">
        {drafts.map((draft) => (
          <li key={draft.workoutId} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">Sesión {draft.sessionLabel}</p>
              <p className="text-sm text-muted-foreground">
                {draft.status === "pending_save"
                  ? "Terminada · pendiente de guardar"
                  : "En curso · tu avance está guardado"}
              </p>
            </div>
            <Button variant="outline" render={<Link href={`/workout/${draft.plannedSessionId}`} />}>
              {draft.status === "pending_save" ? "Recuperar" : "Retomar"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
