import { useEffect, useLayoutEffect, useRef, useState, type ComponentRef } from "react";
import { Animated, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  blockDropTarget,
  scrollDragDelta,
  type DropPoint,
  type DropRect,
  type DropRow,
} from "../lib/block-drop";
import { Action, Notice, s, usePalette } from "./ui";
import { BlockHandle } from "./block-handle";

export type ReorderBlock = Readonly<{ id: string; name: string; members: readonly string[] }>;
type Drag = {
  from: string;
  to: string | null;
  stamp: string;
  point: DropPoint | null;
  startY: number;
  startOffset: number;
};
/** Compact order-only view; prescriptions and series stay in the calling controller. */
export function BlockReorder({
  blocks,
  stamp,
  disabled,
  onMove,
  onClose,
  storageError,
  retryStorage,
}: {
  blocks: readonly ReorderBlock[];
  stamp: string;
  disabled: boolean;
  onMove: (from: string, to: string) => Promise<unknown>;
  onClose: () => void;
  storageError?: string | null;
  retryStorage?: () => Promise<void>;
}) {
  const p = usePalette(),
    insets = useSafeAreaInsets();
  const labels = blocks.map((block, index) =>
    blocks.filter((b) => b.name === block.name).length > 1
      ? `${block.name}, bloque ${index + 1}`
      : block.name,
  );
  const [drag, setDrag] = useState<Drag | null>(null),
    [message, setMessage] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const gesture = useRef<Drag | null>(null),
    [translation] = useState(() => new Animated.Value(0));
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null),
    offset = useRef(0),
    height = useRef(0);
  const viewport = useRef<DropRect>({ x: 0, y: 0, width: 0, height: 0 });
  const layouts = useRef(new Map<string, DropRow>()),
    nodes = useRef(new Map<string, ComponentRef<typeof View>>()),
    geometryStamp = useRef<string | null>(null),
    saving = useRef(false),
    tick = useRef<() => void>(() => {});
  const latest = useRef({ blocks, stamp, disabled, onMove });
  useLayoutEffect(() => {
    latest.current = { blocks, stamp, disabled, onMove };
  });
  function measure() {
    const capturedStamp = latest.current.stamp;
    scroll.current?.measureInWindow((x, y, width, height) => {
      viewport.current = { x: x + 20, y, width: Math.max(0, width - 40), height };
      // Web onLayout observes size, so unchanged-size rows need remeasurement after an order change.
      const blocks = latest.current.blocks;
      let remaining = blocks.length;
      for (const block of blocks) {
        const node = nodes.current.get(block.id);
        if (!node) return;
        node.measureInWindow((_, top, __, rowHeight) => {
          if (latest.current.stamp !== capturedStamp || rowHeight <= 0) return;
          layouts.current.set(block.id, {
            id: block.id,
            y: top - y + offset.current,
            height: rowHeight,
          });
          if (--remaining === 0) {
            geometryStamp.current = capturedStamp;
            const current = gesture.current;
            if (current?.stamp === capturedStamp && current.point) update(current.point);
          }
        });
      }
    });
  }
  function cancel() {
    gesture.current = null;
    translation.setValue(0);
    setDrag(null);
  }
  function update(point: DropPoint) {
    const current = gesture.current;
    if (!current) return;
    const rows = latest.current.blocks.flatMap((b) => {
      const row = layouts.current.get(b.id);
      return row ? [row] : [];
    });
    const to =
      geometryStamp.current === current.stamp
        ? blockDropTarget(rows, viewport.current, offset.current, point)
        : null;
    const next = { ...current, point, to };
    gesture.current = next;
    translation.setValue(point.y - current.startY + offset.current - current.startOffset);
    if (current.to !== to) setDrag(next);
  }
  function begin(from: string, point: DropPoint | null) {
    if (latest.current.disabled || saving.current) return;
    setMessage(null);
    geometryStamp.current = null;
    measure();
    const next = {
      from,
      to: from,
      stamp: latest.current.stamp,
      point,
      startY: point?.y ?? 0,
      startOffset: offset.current,
    };
    gesture.current = next;
    setDrag(next);
  }
  async function commit(from: string, to: string, capturedStamp: string) {
    if (
      latest.current.disabled ||
      saving.current ||
      capturedStamp !== latest.current.stamp ||
      !latest.current.blocks.some((b) => b.id === from) ||
      !latest.current.blocks.some((b) => b.id === to)
    ) {
      setMessage("La lista cambió. Revisa el orden antes de volver a mover.");
      return;
    }
    if (from === to) return;
    saving.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await latest.current.onMove(from, to);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No pudimos guardar el orden. Conservamos tus datos.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function finish() {
    const current = gesture.current;
    cancel();
    if (current?.to && (!current.point || geometryStamp.current === current.stamp))
      void commit(current.from, current.to, current.stamp);
  }
  function shift(id: string, direction: -1 | 1) {
    if (gesture.current) cancel();
    const index = latest.current.blocks.findIndex((b) => b.id === id),
      target = latest.current.blocks[index + direction];
    if (index >= 0 && target) void commit(id, target.id, latest.current.stamp);
  }
  function keyboard(id: string, key: string) {
    if (key === "Escape") {
      cancel();
      return true;
    }
    if (key === " " || key === "Enter") {
      if (gesture.current?.from === id) finish();
      else begin(id, null);
      return true;
    }
    if ((key === "ArrowUp" || key === "ArrowDown") && gesture.current?.from === id) {
      const current = gesture.current,
        index = latest.current.blocks.findIndex((b) => b.id === current.to),
        target = latest.current.blocks[index + (key === "ArrowUp" ? -1 : 1)];
      if (target) {
        const next = { ...current, to: target.id };
        gesture.current = next;
        setDrag(next);
        const row = layouts.current.get(target.id);
        if (
          row &&
          (row.y < offset.current || row.y + row.height > offset.current + viewport.current.height)
        )
          scroll.current?.scrollTo({ y: Math.max(0, row.y - 12), animated: false });
      }
      return true;
    }
    return false;
  }
  useLayoutEffect(() => {
    tick.current = () => {
      const current = gesture.current;
      if (!current) return;
      if (latest.current.disabled || latest.current.stamp !== current.stamp) {
        cancel();
        return;
      }
      if (!current.point) return;
      if (geometryStamp.current !== current.stamp) return;
      const delta = scrollDragDelta(
        viewport.current,
        current.point,
        offset.current,
        height.current,
      );
      if (delta) {
        offset.current += delta;
        scroll.current?.scrollTo({ y: offset.current, animated: false });
        update(current.point);
      }
    };
  });
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const interval = setInterval(() => tick.current(), 50);
    return () => clearInterval(interval);
  }, [dragging]);
  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        maxWidth: 560,
        alignSelf: "center",
        backgroundColor: p.bg,
        paddingTop: insets.top,
      }}
    >
      <View style={{ padding: 16, gap: 10 }}>
        <Action
          label="Volver"
          accessibilityLabel="Volver de reordenar"
          quiet
          disabled={busy}
          onPress={() => {
            cancel();
            onClose();
          }}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            height: 48,
          }}
        >
          <Text accessibilityRole="header" style={[s.subheading, { color: p.ink }]}>
            Reordenar
          </Text>
          {drag ? (
            <Action
              label="Cancelar"
              accessibilityLabel="Cancelar movimiento"
              quiet
              onPress={cancel}
            />
          ) : null}
        </View>
        {storageError ? (
          <Notice
            message={storageError}
            retry={
              retryStorage
                ? () => {
                    void retryStorage()
                      .then(() => setMessage(null))
                      .catch(() => {});
                  }
                : undefined
            }
          />
        ) : null}
        <Text
          accessibilityLiveRegion="polite"
          style={[s.caption, { color: message ? p.danger : p.muted, minHeight: 36 }]}
        >
          {(message !== storageError ? message : null) ??
            (drag
              ? drag.to
                ? `Destino: posición ${blocks.findIndex((b) => b.id === drag.to) + 1}`
                : "Fuera de la lista · soltar cancela"
              : "Arrastra el asa para mover cada bloque.")}
        </Text>
      </View>
      <ScrollView
        ref={scroll}
        testID="block-reorder-list"
        scrollEnabled={!drag && !busy}
        onLayout={measure}
        onContentSizeChange={(_, h) => {
          height.current = h;
        }}
        onScroll={(event) => {
          offset.current = Math.max(0, event.nativeEvent.contentOffset.y);
        }}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 20,
          overflow: "hidden",
        }}
      >
        {blocks.map((block, index) => (
          <View
            key={block.id}
            testID={`order-block-${block.id}`}
            ref={(node) => {
              if (node) nodes.current.set(block.id, node);
              else nodes.current.delete(block.id);
            }}
            onLayout={(event) => {
              const { y, height } = event.nativeEvent.layout;
              layouts.current.set(block.id, { id: block.id, y, height });
            }}
          >
            <Animated.View
              style={{
                borderTopWidth: 2,
                borderColor: drag?.to === block.id ? p.blue : p.border,
                paddingVertical: 10,
                gap: 4,
                backgroundColor: drag?.from === block.id ? p.tint : p.bg,
                zIndex: drag?.from === block.id ? 1 : 0,
                transform: [
                  { translateY: drag?.from === block.id && drag.point ? translation : 0 },
                ],
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <BlockHandle
                  label={labels[index]}
                  disabled={disabled || busy}
                  grabbed={drag?.from === block.id}
                  keyboardGrabbed={drag?.from === block.id && !drag.point}
                  begin={(point) => begin(block.id, point)}
                  move={update}
                  finish={finish}
                  cancel={cancel}
                  keyboard={(key) => keyboard(block.id, key)}
                  shift={(direction) => shift(block.id, direction)}
                />
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text style={[s.label, { color: p.ink }]}>
                    {index + 1}. {block.name}
                  </Text>
                  {block.members.length ? (
                    <Text style={[s.caption, { color: p.muted }]}>{block.members.join(" · ")}</Text>
                  ) : null}
                </View>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                <Action
                  label="Subir"
                  accessibilityLabel={`Subir bloque ${labels[index]}`}
                  quiet
                  disabled={disabled || busy || !!drag || index === 0}
                  onPress={() => shift(block.id, -1)}
                />
                <Action
                  label="Bajar"
                  accessibilityLabel={`Bajar bloque ${labels[index]}`}
                  quiet
                  disabled={disabled || busy || !!drag || index === blocks.length - 1}
                  onPress={() => shift(block.id, 1)}
                />
              </View>
            </Animated.View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
