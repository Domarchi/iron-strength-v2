import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { GestureDetector, GestureHandlerRootView, Gesture } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "../lib/motion-context";
import { Button, IconButton } from "./actions";
import { ListRow } from "./display";
import { motion, radius } from "./tokens";
import { useTheme } from "./theme";
import { Txt } from "./text";

/** Hoja inferior con asa. Se cierra con Escape, el fondo, el botón o arrastrando hacia abajo. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const y = useSharedValue(0);
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      y.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 90) scheduleOnRN(onClose);
      y.value = withSpring(0);
    });
  const drag = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(motion.base)}
          exiting={reduced ? undefined : FadeOut.duration(motion.fast)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: t.scrim,
          }}
        >
          <Pressable
            accessibilityLabel="Cerrar panel"
            accessibilityRole="button"
            onPress={onClose}
            style={{ flex: 1 }}
          />
        </Animated.View>
        <Animated.View
          entering={reduced ? undefined : SlideInDown.duration(motion.base)}
          exiting={reduced ? undefined : SlideOutDown.duration(motion.fast)}
          accessibilityViewIsModal
          accessibilityLabel={title}
          role="dialog"
          aria-label={title}
          aria-modal
          style={[
            {
              backgroundColor: t.surface,
              borderTopLeftRadius: radius.lg + 8,
              borderTopRightRadius: radius.lg + 8,
              paddingBottom: insets.bottom + 16,
              maxHeight: "88%",
              width: "100%",
              maxWidth: 560,
              alignSelf: "center",
            },
            drag,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View style={{ paddingTop: 10, paddingHorizontal: 20, gap: 8 }}>
              <View
                style={{
                  alignSelf: "center",
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: t.line,
                }}
              />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Txt variant="heading" accessibilityRole="header">
                  {title}
                </Txt>
                <IconButton icon="close" label="Cerrar panel" onPress={onClose} />
              </View>
            </View>
          </GestureDetector>
          <View style={{ paddingHorizontal: 20, gap: 12 }}>{children}</View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Confirmación. Si es destructiva, la acción va con rol de peligro y «Cancelar» queda primero en lectura. */
export function Dialog({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive = false,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}) {
  return (
    <Sheet visible={visible} onClose={onCancel} title={title}>
      <Txt muted>{message}</Txt>
      <Button label="Cancelar" onPress={onCancel} role="secondary" />
      <Button label={confirmLabel} onPress={onConfirm} role={destructive ? "danger" : "primary"} />
    </Sheet>
  );
}

export type MenuItem = { label: string; onPress: () => void; danger?: boolean };
/** Menú de acciones en hoja. Las de peligro van al final y separadas. */
export function Menu({
  visible,
  title,
  items,
  onClose,
}: {
  visible: boolean;
  title: string;
  items: MenuItem[];
  onClose: () => void;
}) {
  const t = useTheme();
  const normal = items.filter((i) => !i.danger);
  const danger = items.filter((i) => i.danger);
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {normal.map((i) => (
        <ListRow
          key={i.label}
          title={i.label}
          onPress={() => {
            onClose();
            i.onPress();
          }}
        />
      ))}
      {danger.length ? (
        <View style={{ height: 1, backgroundColor: t.line, marginVertical: 4 }} />
      ) : null}
      {danger.map((i) => (
        <Button
          key={i.label}
          label={i.label}
          role="danger"
          onPress={() => {
            onClose();
            i.onPress();
          }}
        />
      ))}
    </Sheet>
  );
}
