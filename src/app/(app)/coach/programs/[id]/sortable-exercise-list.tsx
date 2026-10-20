"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

type Drag = {
  id: string;
  from: number;
  to: number;
  x: number;
  y: number;
  pointerId: number | null;
  active: boolean;
};

// Pointer Events cubre mouse, lápiz y touch. Solo el asa bloquea el pan nativo.
export function SortableExerciseList<T extends { id: string; name: string }>({
  items,
  disabled,
  onReorder,
  onBusyChange,
  children,
}: {
  items: T[];
  disabled: boolean;
  onReorder: (ids: string[]) => void;
  onBusyChange: (busy: boolean) => void;
  children: (item: T, index: number, handle: ReactNode) => ReactNode;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const active = useRef<Drag | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const frame = useRef<number | null>(null);
  const focusId = useRef<string | null>(null);
  const prefix = useId();
  const instructions = `${prefix}-instructions`;
  const handleId = (id: string) => `${prefix}-${id}`;
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  useEffect(() => {
    if (!disabled && focusId.current) {
      document.getElementById(`${prefix}-${focusId.current}`)?.focus({ preventScroll: true });
      focusId.current = null;
    }
  }, [disabled, prefix]);
  function publish(next: Drag) {
    active.current = next;
    setDrag(next);
    const name = items.find((item) => item.id === next.id)?.name;
    setAnnouncement(
      `${name}: posición ${next.to + 1} de ${items.length}. Suelta para mover; Escape para cancelar.`,
    );
  }
  function finish(commit: boolean) {
    const current = active.current;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    active.current = null;
    setDrag(null);
    if (!current?.active) return;
    onBusyChange(false);
    focusId.current = current.id;
    if (commit && current.to !== current.from) {
      const ids = items.map((item) => item.id);
      ids.splice(current.from, 1);
      ids.splice(current.to, 0, current.id);
      setAnnouncement(`Destino: posición ${current.to + 1} de ${items.length}.`);
      onReorder(ids);
    } else {
      setAnnouncement("Orden sin cambios.");
      focusId.current = null;
    }
  }
  function targetAt(y: number): number {
    const rows = [...(list.current?.children ?? [])];
    const centers = rows.map((row) => {
      const r = row.getBoundingClientRect();
      return (r.top + r.bottom) / 2;
    });
    const origin = active.current?.from ?? 0;
    let target = origin;
    if (y > (centers[origin] ?? y)) {
      for (let i = origin + 1; i < centers.length; i++) if (y > centers[i]) target = i;
    } else {
      for (let i = origin - 1; i >= 0; i--) if (y < centers[i]) target = i;
    }
    return target;
  }
  function autoScroll() {
    const current = active.current;
    if (!current?.active || current.pointerId === null) return;
    const bounds = list.current?.getBoundingClientRect();
    if (!bounds?.height) {
      finish(false);
      return;
    }
    let distance =
      current.y < 72
        ? -Math.min(18, (72 - current.y) / 3)
        : current.y > window.innerHeight - 72
          ? Math.min(18, (current.y - window.innerHeight + 72) / 3)
          : 0;
    if (
      (distance > 0 && bounds.bottom <= current.y + 32) ||
      (distance < 0 && bounds.top >= current.y - 32)
    )
      distance = 0;
    if (distance) {
      window.scrollBy(0, distance);
      const to = targetAt(current.y);
      if (to !== current.to) publish({ ...current, to });
    }
    frame.current = requestAnimationFrame(autoScroll);
  }
  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = active.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.active && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6)
      return;
    event.preventDefault();
    if (!current.active) {
      onBusyChange(true);
      frame.current = requestAnimationFrame(autoScroll);
    }
    publish({
      ...current,
      active: true,
      x: event.clientX,
      y: event.clientY,
      to: targetAt(event.clientY),
    });
  }
  return (
    <>
      <p id={instructions} className="sr-only">
        Arrastra desde el asa para cambiar el orden. Con teclado: Espacio o Enter levanta, flechas
        arriba y abajo mueven, Enter suelta y Escape cancela.
      </p>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
      <ol ref={list} className="flex flex-col gap-4" aria-label="Ejercicios de la sesión">
        {items.map((item, index) => (
          <li
            key={item.id}
            data-sortable-id={item.id}
            className={`relative rounded-md ${drag?.active && drag.id === item.id ? "opacity-45 ring-2 ring-primary" : ""}`}
          >
            {drag?.active && drag.to === index && drag.to !== drag.from ? (
              <div
                data-testid="exercise-drop-target"
                className={`pointer-events-none absolute -inset-x-1 z-10 border-t-4 border-primary ${drag.to > drag.from ? "-bottom-2" : "-top-2"}`}
                aria-hidden
              />
            ) : null}
            {children(
              item,
              index,
              <Button
                id={handleId(item.id)}
                type="button"
                size="icon"
                variant="ghost"
                disabled={disabled || items.length < 2}
                aria-label={`Reordenar ${item.name}`}
                aria-describedby={instructions}
                aria-pressed={!!drag?.active && drag.id === item.id}
                title="Arrastra para reordenar"
                className="shrink-0 touch-none cursor-grab active:cursor-grabbing"
                style={{ touchAction: "none" }}
                onPointerDown={(event) => {
                  if (disabled || event.button !== 0 || active.current) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  active.current = {
                    id: item.id,
                    from: index,
                    to: index,
                    x: event.clientX,
                    y: event.clientY,
                    pointerId: event.pointerId,
                    active: false,
                  };
                }}
                onPointerMove={move}
                onPointerUp={(event) => {
                  if (active.current?.pointerId !== event.pointerId) return;
                  const r = list.current?.getBoundingClientRect();
                  const inside =
                    r &&
                    event.clientX >= r.left &&
                    event.clientX <= r.right &&
                    event.clientY >= Math.max(0, r.top) &&
                    event.clientY <= Math.min(window.innerHeight, r.bottom);
                  finish(!!inside);
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => finish(false)}
                onLostPointerCapture={() => {
                  if (active.current?.pointerId !== null) finish(false);
                }}
                onBlur={() => {
                  if (active.current?.pointerId === null) finish(false);
                }}
                onKeyDown={(event) => {
                  if (disabled) return;
                  const current = active.current;
                  if (event.key === "Escape" && current) {
                    event.preventDefault();
                    finish(false);
                    return;
                  }
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    if (current?.active) finish(true);
                    else {
                      onBusyChange(true);
                      publish({
                        id: item.id,
                        from: index,
                        to: index,
                        x: 0,
                        y: 0,
                        pointerId: null,
                        active: true,
                      });
                    }
                  } else if (
                    current?.active &&
                    current.pointerId === null &&
                    (event.key === "ArrowUp" || event.key === "ArrowDown")
                  ) {
                    event.preventDefault();
                    publish({
                      ...current,
                      to: Math.max(
                        0,
                        Math.min(items.length - 1, current.to + (event.key === "ArrowUp" ? -1 : 1)),
                      ),
                    });
                  }
                }}
              >
                <GripVertical aria-hidden />
              </Button>,
            )}
          </li>
        ))}
      </ol>
      {drag?.active && drag.pointerId !== null ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 max-w-64 rounded-md border border-primary bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-xl motion-safe:transition-shadow"
          style={{
            left: Math.max(8, Math.min(drag.x + 12, window.innerWidth - 240)),
            top: Math.max(8, Math.min(drag.y - 24, window.innerHeight - 64)),
          }}
        >
          <span className="mr-2 text-primary">⠿</span>
          {items.find((item) => item.id === drag.id)?.name}
          <span className="ml-2 text-xs text-muted-foreground">
            {drag.to + 1} / {items.length}
          </span>
        </div>
      ) : null}
    </>
  );
}
