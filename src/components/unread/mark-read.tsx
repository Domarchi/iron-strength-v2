"use client";

import { useEffect } from "react";
import { markReadAction } from "@/app/(app)/history/[id]/read-actions";

// Al abrir un entrenamiento con comentarios sin leer los marca como leídos (RF-37). Solo actúa si hay
// algo pendiente: tras marcar, la pantalla se actualiza con cero y no vuelve a disparar.
export function MarkRead({ workoutId, unread }: { workoutId: string; unread: number }) {
  useEffect(() => {
    if (unread > 0) void markReadAction(workoutId);
  }, [workoutId, unread]);
  return null;
}
