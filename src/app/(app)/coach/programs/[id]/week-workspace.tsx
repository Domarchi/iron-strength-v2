"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

type Guard = { dirtyIds: string[]; dirty: boolean; setDirty: (id: string, dirty: boolean) => void };
const RoutineGuard = createContext<Guard>({ dirtyIds: [], dirty: false, setDirty: () => {} });
export const useRoutineGuard = () => useContext(RoutineGuard);

export function CleanEditor({ children }: { children: ReactNode }) {
  const { dirty } = useRoutineGuard();
  return (
    <div>
      <fieldset disabled={dirty} className="min-w-0 disabled:opacity-50">
        {children}
      </fieldset>
      {dirty ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Guarda o descarta los cambios pendientes para usar esta herramienta.
        </p>
      ) : null}
    </div>
  );
}

export function WeekWorkspace({
  weeks,
  initialWeek,
  children,
  tools,
  footer,
}: {
  weeks: { number: number; editable: boolean; sessions: number; exercises: number }[];
  initialWeek: number;
  children: ReactNode[];
  tools?: ReactNode;
  footer?: ReactNode;
}) {
  const [active, setActive] = useState(initialWeek);
  const [dirtyIds, setDirtyIds] = useState<string[]>([]);
  const dirty = dirtyIds.length > 0;
  const setDirty = useCallback(
    (id: string, value: boolean) =>
      setDirtyIds((ids) =>
        value ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((i) => i !== id),
      ),
    [],
  );
  const guard: Guard = { dirtyIds, dirty, setDirty };
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const followLink = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !anchor ||
        anchor.getAttribute("href")?.startsWith("#") ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.button !== 0
      )
        return;
      if (
        !window.confirm(
          "Tienes cambios sin guardar en el editor. ¿Salir del editor? Los cambios protegidos quedan en este dispositivo.",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const leaveByForm = (event: SubmitEvent) => {
      if (
        !(event.target instanceof HTMLFormElement) ||
        event.target.closest("[data-routine-editor]")
      )
        return;
      if (
        !window.confirm(
          "Tienes cambios sin guardar en el editor. ¿Salir del editor? Los cambios protegidos quedan en este dispositivo.",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("submit", leaveByForm, true);
    document.addEventListener("click", followLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("submit", leaveByForm, true);
      document.removeEventListener("click", followLink, true);
    };
  }, [dirty]);
  return (
    <RoutineGuard value={guard}>
      <div data-routine-editor className="flex flex-col gap-5">
        <nav
          aria-label="Semanas del programa"
          className={`grid gap-2 ${weeks.length === 1 ? "grid-cols-1" : "grid-cols-2"} ${weeks.length === 3 ? "sm:grid-cols-3" : weeks.length >= 4 ? "sm:grid-cols-4" : ""}`}
        >
          {weeks.map((week) => (
            <Button
              key={week.number}
              variant={active === week.number ? "default" : "outline"}
              className="h-auto min-h-16 justify-start gap-2 px-3 py-2 text-left"
              aria-pressed={active === week.number}
              aria-controls={`editor-week-${week.number}`}
              onClick={() => setActive(week.number)}
            >
              {!week.editable ? <Lock className="size-4 shrink-0" aria-hidden /> : null}
              <span className="min-w-0">
                <span className="block font-semibold">Semana {week.number}</span>
                <span className="block text-xs font-normal opacity-90">
                  {week.sessions} sesiones · {week.exercises} ejercicios
                </span>
              </span>
            </Button>
          ))}
        </nav>
        {dirtyIds.some((id) => !id.endsWith("-drag")) ? (
          <p
            role="status"
            className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
          >
            Tienes cambios sin guardar. Puedes cambiar de semana sin perderlos.
          </p>
        ) : null}
        {children.map((child, index) => (
          <div
            key={weeks[index].number}
            id={`editor-week-${weeks[index].number}`}
            hidden={active !== weeks[index].number}
          >
            {child}
          </div>
        ))}
        {tools ? <CleanEditor>{tools}</CleanEditor> : null}
        {footer ? <CleanEditor>{footer}</CleanEditor> : null}
      </div>
    </RoutineGuard>
  );
}
