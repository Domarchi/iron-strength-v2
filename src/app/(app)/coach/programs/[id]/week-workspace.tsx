"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  editorViewStorage,
  readEditorView,
  saveEditorView,
  type EditorViewScope,
} from "@/lib/coach/editor-view";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

type Guard = {
  activeWeek?: number;
  sessions?: Record<number, string>;
  selectSession?: (week: number, id: string) => void;
  dirtyIds: string[];
  dirty: boolean;
  setDirty: (id: string, dirty: boolean) => void;
};
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

const subscribe = () => () => {};
export function WeekWorkspace(props: Parameters<typeof Workspace>[0]) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return hydrated ? <Workspace {...props} /> : <p role="status">Cargando espacio de trabajo…</p>;
}
function Workspace({
  weeks,
  scope,
  initialWeek,
  children,
  tools,
  footer,
}: {
  weeks: {
    number: number;
    editable: boolean;
    sessions: number;
    exercises: number;
    sessionIds?: string[];
  }[];
  initialWeek: number;
  scope?: EditorViewScope;
  children: ReactNode[];
  tools?: ReactNode;
  footer?: ReactNode;
}) {
  const [restored] = useState(() => readEditorView(editorViewStorage(), scope, weeks, initialWeek));
  const [view, setView] = useState(restored.view);
  const current = useRef(view);
  const [viewError, setViewError] = useState(!restored.writable);
  const active = weeks.some((week) => week.number === view.week) ? view.week : initialWeek;
  function changeView(next: typeof view) {
    current.current = next;
    setView(next);
    if (scope && restored.writable) setViewError(!saveEditorView(editorViewStorage(), scope, next));
  }
  function selectSession(week: number, id: string) {
    if (!weeks.find((w) => w.number === week)?.sessionIds?.includes(id)) return;
    changeView({ ...current.current, sessions: { ...current.current.sessions, [week]: id } });
  }
  const [dirtyIds, setDirtyIds] = useState<string[]>([]);
  const dirty = dirtyIds.length > 0;
  const setDirty = useCallback(
    (id: string, value: boolean) =>
      setDirtyIds((ids) =>
        value ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((i) => i !== id),
      ),
    [],
  );
  const guard: Guard = {
    activeWeek: active,
    sessions: view.sessions,
    selectSession: scope ? selectSession : undefined,
    dirtyIds,
    dirty,
    setDirty,
  };
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
        event.target.closest("[data-routine-editor]") ||
        event.target.hasAttribute("data-local-exit")
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
          className="coach-week-ribbon grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {weeks.map((week, index) => (
            <Button
              key={week.number}
              variant={active === week.number ? "default" : "outline"}
              className="h-auto min-h-16 justify-start gap-2 px-3 py-2 text-left"
              aria-pressed={active === week.number}
              aria-controls={`editor-week-${week.number}`}
              onClick={() => changeView({ ...current.current, week: week.number })}
              onKeyDown={(event) => {
                if (
                  event.defaultPrevented ||
                  event.nativeEvent.isComposing ||
                  event.ctrlKey ||
                  event.metaKey ||
                  event.altKey ||
                  event.shiftKey
                )
                  return;
                let next: number | undefined;
                if (event.key === "ArrowRight") next = (index + 1) % weeks.length;
                if (event.key === "ArrowLeft") next = (index + weeks.length - 1) % weeks.length;
                if (event.key === "Home") next = 0;
                if (event.key === "End") next = weeks.length - 1;
                if (next === undefined) return;
                event.preventDefault();
                changeView({ ...current.current, week: weeks[next].number });
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>("button")
                  [next]?.focus();
              }}
            >
              {!week.editable ? <Lock className="size-4 shrink-0" aria-hidden /> : null}
              <span className="min-w-0">
                <span className="block font-semibold">Semana {week.number}</span>
                <span className="week-count block text-xs font-normal">
                  {week.sessions} sesiones · {week.exercises} ejercicios
                </span>
                {week.sessionIds?.some((sessionId) =>
                  dirtyIds.some(
                    (id) =>
                      !id.endsWith("-drag") && (id === sessionId || id.startsWith(`${sessionId}-`)),
                  ),
                ) ? (
                  <span className="week-pending block text-xs font-normal">Cambios pendientes</span>
                ) : null}
              </span>
            </Button>
          ))}
        </nav>
        {viewError ? (
          <p role="status" className="text-sm text-muted-foreground">
            No se pudo guardar la posición del editor en esta pestaña. Puedes seguir editando y
            guardar la sesión.
          </p>
        ) : null}
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
        {tools ?? null}
        {footer ? <CleanEditor>{footer}</CleanEditor> : null}
      </div>
    </RoutineGuard>
  );
}
