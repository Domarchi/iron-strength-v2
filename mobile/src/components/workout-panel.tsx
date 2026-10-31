import type { PropsWithChildren } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "../lib/motion-context";
import { IconAction, s, usePalette } from "./ui";

/** Native modal owns focus/back handling. Training state stays in its controller. */
export function WorkoutPanel({
  title,
  onClose,
  dismissible = true,
  children,
}: PropsWithChildren<{ title: string; onClose: () => void; dismissible?: boolean }>) {
  const p = usePalette(),
    insets = useSafeAreaInsets(),
    reduced = useReducedMotion();
  return (
    <Modal
      transparent
      animationType={reduced ? "none" : "fade"}
      accessibilityLabel={title}
      onRequestClose={() => {
        if (dismissible) onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.55)",
          paddingTop: Math.max(insets.top, 24),
        }}
      >
        <View
          style={{
            maxHeight: "94%",
            width: "100%",
            maxWidth: 560,
            alignSelf: "center",
            backgroundColor: p.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingBottom: insets.bottom,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingLeft: 20,
              paddingRight: 8,
              paddingVertical: 8,
              borderBottomWidth: 0.5,
              borderBottomColor: p.border,
            }}
          >
            <Text accessibilityRole="header" style={[s.subheading, { flex: 1, color: p.ink }]}>
              {title}
            </Text>
            <IconAction
              label="Cerrar panel"
              icon="close"
              disabled={!dismissible}
              onPress={onClose}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, paddingBottom: 28, gap: 16 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
