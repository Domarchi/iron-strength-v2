import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "./actions";
import { useTheme } from "./theme";
import { Txt } from "./text";

/** Cabecera estándar: atrás, título (con subtítulo opcional) y hasta tres acciones. */
export function AppBar({
  title,
  subtitle,
  onBack,
  actions,
  inset = true,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: ReactNode;
  inset?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: inset ? insets.top : 0,
        paddingHorizontal: 8,
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: t.bg,
      }}
    >
      {onBack ? (
        <IconButton icon="chevronLeft" label="Volver" onPress={onBack} />
      ) : (
        <View style={{ width: 12 }} />
      )}
      <View style={{ flex: 1 }}>
        <Txt variant="heading" numberOfLines={1} accessibilityRole="header">
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="caption" muted numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {actions}
    </View>
  );
}
