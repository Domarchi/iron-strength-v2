"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useRoutineGuard } from "./week-workspace";
const SessionWorkspaceContext = createContext<{
  activeId: string | undefined;
  activate: (id: string) => void;
} | null>(null);
export const useSessionWorkspace = () => useContext(SessionWorkspaceContext);
export function SessionWorkspace({
  sessions,
  children,
  weekNumber = 1,
}: {
  sessions: { id: string; label: string; title?: string | null }[];
  children: ReactNode[];
  weekNumber?: number;
}) {
  const [selected, setSelected] = useState(sessions[0]?.id);
  const guard = useRoutineGuard();
  const selection = guard.sessions?.[weekNumber] ?? selected;
  const activeId = sessions.some((s) => s.id === selection) ? selection : sessions[0]?.id;
  const activate = (id: string) => {
    setSelected(id);
    guard.selectSession?.(weekNumber, id);
  };
  const dirty = (id: string) =>
    guard.dirtyIds.some(
      (key) => !key.endsWith("-drag") && (key === id || key.startsWith(`${id}-`)),
    );
  return (
    <SessionWorkspaceContext value={{ activeId, activate }}>
      <div className="min-w-0 space-y-4">
        {sessions.length > 1 ? (
          <nav
            aria-label={`Sesiones de semana ${weekNumber}`}
            className="coach-session-tabs flex flex-wrap gap-2"
          >
            {sessions.map((session, index) => (
              <Button
                key={session.id}
                variant={activeId === session.id ? "default" : "outline"}
                className="h-auto min-h-11 max-w-full flex-col items-start gap-0.5 whitespace-normal text-left"
                aria-pressed={activeId === session.id}
                aria-controls={`editor-session-${session.id}`}
                onClick={() => activate(session.id)}
                onKeyDown={(event) => {
                  let next: number | undefined;
                  if (event.key === "ArrowRight") next = (index + 1) % sessions.length;
                  if (event.key === "ArrowLeft")
                    next = (index + sessions.length - 1) % sessions.length;
                  if (event.key === "Home") next = 0;
                  if (event.key === "End") next = sessions.length - 1;
                  if (next === undefined) return;
                  event.preventDefault();
                  activate(sessions[next].id);
                  event.currentTarget.parentElement
                    ?.querySelectorAll<HTMLButtonElement>("button")
                    [next]?.focus();
                }}
              >
                <span>
                  Sesión {session.label}
                  {session.title ? ` · ${session.title}` : ""}
                </span>
                {dirty(session.id) ? (
                  <span className="text-xs font-normal">Cambios pendientes</span>
                ) : null}
              </Button>
            ))}
          </nav>
        ) : null}
        {sessions.some((s) => dirty(s.id)) ? (
          <p className="text-sm text-muted-foreground">
            Borradores conservados. Guarda cada sesión para copiar o agregar ejercicios.
          </p>
        ) : null}
        {children.map((child, index) => (
          <div
            key={sessions[index].id}
            id={`editor-session-${sessions[index].id}`}
            data-session-panel
            hidden={activeId !== sessions[index].id}
          >
            {child}
          </div>
        ))}
      </div>
    </SessionWorkspaceContext>
  );
}
