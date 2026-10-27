import { useLayoutEffect, useRef, useState } from "react";
import { PanResponder, View, type GestureResponderEvent } from "react-native";
import type { DropPoint } from "../lib/block-drop";
import type { BlockHandleProps } from "./block-handle-types";
import { usePalette } from "./ui";
import { Icon } from "./icon";
const pointOf = (event: GestureResponderEvent): DropPoint => ({
  x: event.nativeEvent.pageX,
  y: event.nativeEvent.pageY,
});
function makeResponder(handlers: () => BlockHandleProps) {
  return PanResponder.create({
    onStartShouldSetPanResponder: () => !handlers().disabled,
    onMoveShouldSetPanResponder: () => !handlers().disabled,
    onPanResponderGrant: (event) => handlers().begin(pointOf(event)),
    onPanResponderMove: (event) => handlers().move(pointOf(event)),
    onPanResponderRelease: (event) => {
      handlers().move(pointOf(event));
      handlers().finish();
    },
    onPanResponderTerminate: () => handlers().cancel(),
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  });
}
export function BlockHandle(props: BlockHandleProps) {
  const p = usePalette(),
    latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  // PanResponder.create stores callbacks without invoking them. They read committed props only on input.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => makeResponder(() => latest.current));
  return (
    <View
      {...responder.panHandlers}
      accessible
      focusable={!props.disabled}
      accessibilityRole="button"
      accessibilityLabel={`Mover ${props.label}`}
      accessibilityHint="Espacio para tomar, flechas para mover y Escape para cancelar."
      accessibilityState={{ disabled: props.disabled }}
      aria-pressed={props.grabbed}
      accessibilityActions={[
        { name: "increment", label: "Bajar" },
        { name: "decrement", label: "Subir" },
        { name: "escape", label: "Cancelar movimiento" },
      ]}
      onAccessibilityAction={(event) => {
        const name = event.nativeEvent.actionName;
        if (name === "increment") props.shift(1);
        if (name === "decrement") props.shift(-1);
        if (name === "escape") props.cancel();
      }}
      onKeyDown={(event) => {
        if (!props.disabled && props.keyboard(event.nativeEvent.key)) event.preventDefault();
      }}
      onBlur={() => {
        if (props.keyboardGrabbed) props.cancel();
      }}
      style={{
        minWidth: 44,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        backgroundColor: props.grabbed ? p.tint : "transparent",
        opacity: props.disabled ? 0.5 : 1,
      }}
    >
      <Icon name="grip" color={props.grabbed ? p.blue : p.muted} size={22} />
    </View>
  );
}
