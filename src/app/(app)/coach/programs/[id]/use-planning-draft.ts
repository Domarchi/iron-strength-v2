"use client";
import { useEffect, useState } from "react";
import {
  readPlanningDraft,
  writePlanningDraft,
  clearPlanningDraft,
  type PlanningDraft,
} from "@/lib/coach/planning-draft";
import { useRoutineGuard } from "./week-workspace";
export function usePlanningDraft(
  userId: string,
  programId: string,
  operation: PlanningDraft["operation"],
) {
  const pointer = `is:planning-tab:${userId}:${programId}:${operation}`;
  const [draft, setDraft] = useState<PlanningDraft | null>(() => {
    try {
      return readPlanningDraft(
        localStorage,
        userId,
        programId,
        operation,
        sessionStorage.getItem(pointer),
      );
    } catch {
      return null;
    }
  });
  const [storageError, setStorageError] = useState<string | null>(null);
  const guard = useRoutineGuard(),
    key = `planning-${operation}-${programId}`,
    setDirty = guard.setDirty;
  useEffect(() => {
    setDirty(key, !!draft);
  }, [draft, key, setDirty]);
  const blocked = guard.dirtyIds.some((id) => id !== key);
  function prepare(input: PlanningDraft["input"]): PlanningDraft | null {
    const next =
      draft ??
      ({
        ...{
          version: 1 as const,
          id: crypto.randomUUID(),
          userId,
          programId,
          updatedAt: new Date().toISOString(),
        },
        operation,
        input,
      } as PlanningDraft);
    try {
      writePlanningDraft(localStorage, next);
      try {
        sessionStorage.setItem(pointer, next.id);
      } catch {
        /* La copia local sigue siendo recuperable. */
      }
      setDraft(next);
      setDirty(key, true);
      setStorageError(null);
      return next;
    } catch {
      setStorageError(
        "No se pudo proteger la petición en este dispositivo. Libera espacio y vuelve a confirmar antes de enviarla.",
      );
      return null;
    }
  }
  function finish(current: PlanningDraft) {
    try {
      clearPlanningDraft(localStorage, current);
      if (sessionStorage.getItem(pointer) === current.id) sessionStorage.removeItem(pointer);
    } catch {
      setStorageError(
        "La operación está resuelta, pero no se pudo limpiar su copia local. Una confirmación posterior conservará el mismo resultado.",
      );
    }
    setDraft(null);
    setDirty(key, false);
  }
  return { draft, prepare, finish, blocked, storageError };
}
export const subscribePlanningHydration = () => () => {};
