import { useEffect, useLayoutEffect, useRef } from "react";
import type { BlockHandleProps } from "./block-handle-types";
import { usePalette } from "./ui";
import { Icon } from "./icon";

// Pointer capture survives our own programmatic scroll. RN Web's responder cancels on any ancestor scroll.
export function BlockHandle(props: BlockHandleProps) {
  const p = usePalette(),
    pointer = useRef<number | null>(null),
    latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  useEffect(() => {
    function cancel() {
      if (pointer.current === null) return;
      pointer.current = null;
      latest.current.cancel();
    }
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, []);
  return (
    <button
      type="button"
      aria-label={`Mover ${props.label}`}
      aria-description="Espacio para tomar, flechas para mover y Escape para cancelar."
      aria-pressed={props.grabbed}
      disabled={props.disabled}
      onPointerDown={(event) => {
        if (props.disabled || event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          props.cancel();
          return;
        }
        pointer.current = event.pointerId;
        props.begin({ x: event.clientX, y: event.clientY });
      }}
      onPointerMove={(event) => {
        if (pointer.current === event.pointerId) props.move({ x: event.clientX, y: event.clientY });
      }}
      onPointerUp={(event) => {
        if (pointer.current !== event.pointerId) return;
        pointer.current = null;
        props.move({ x: event.clientX, y: event.clientY });
        props.finish();
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        if (pointer.current !== event.pointerId) return;
        pointer.current = null;
        props.cancel();
      }}
      onLostPointerCapture={(event) => {
        if (pointer.current !== event.pointerId) return;
        pointer.current = null;
        props.cancel();
      }}
      onKeyDown={(event) => {
        if (!props.disabled && props.keyboard(event.key)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onBlur={() => {
        if (props.keyboardGrabbed) props.cancel();
      }}
      style={{
        minWidth: 44,
        minHeight: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        border: 0,
        padding: 0,
        background: props.grabbed ? p.tint : "transparent",
        opacity: props.disabled ? 0.5 : 1,
        touchAction: "none",
        cursor: props.disabled ? "default" : props.grabbed ? "grabbing" : "grab",
        userSelect: "none",
      }}
    >
      <Icon name="grip" color={props.grabbed ? p.blue : p.muted} size={22} />
    </button>
  );
}
