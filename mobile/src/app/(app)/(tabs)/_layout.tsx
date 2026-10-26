import { useReducedMotion } from "../../../lib/motion-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs } from "expo-router";
import { View, useWindowDimensions, type ColorValue } from "react-native";
import { usePalette } from "../../../components/ui";
import { Icon, type IconName } from "../../../components/icon";
const icon = (name: IconName) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    const p = usePalette();
    return (
      <View
        style={{
          width: 36,
          height: 28,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          opacity: focused ? 1 : 0.85,
        }}
      >
        <Icon name={name} color={typeof color === "string" ? color : p.muted} size={22} />
      </View>
    );
  };
const icons = {
  home: icon("home"),
  train: icon("train"),
  history: icon("history"),
  progress: icon("progress"),
  account: icon("account"),
};
export default function TabLayout() {
  const reduced = useReducedMotion();
  const p = usePalette(),
    insets = useSafeAreaInsets(),
    { fontScale } = useWindowDimensions();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: reduced ? "none" : "fade",
        transitionSpec: { animation: "timing", config: { duration: 160 } },
        sceneStyle: { backgroundColor: p.bg },
        tabBarActiveTintColor: p.blue,
        tabBarInactiveTintColor: p.muted,
        tabBarAllowFontScaling: true,
        tabBarStyle: {
          backgroundColor: p.bg,
          borderTopColor: p.border,
          height: Math.max(66, Math.ceil(50 + 16 * fontScale)) + insets.bottom,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 4),
        },
        tabBarItemStyle: { minHeight: 48 },
        tabBarLabelStyle: {
          fontSize: 11,
          lineHeight: 16,
          fontWeight: "500",
          marginTop: 2,
          flexShrink: 0,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Inicio", tabBarIcon: icons.home }} />
      <Tabs.Screen name="train" options={{ title: "Entrenar", tabBarIcon: icons.train }} />
      <Tabs.Screen name="history" options={{ title: "Historial", tabBarIcon: icons.history }} />
      <Tabs.Screen name="progress" options={{ title: "Progreso", tabBarIcon: icons.progress }} />
      <Tabs.Screen name="account" options={{ title: "Cuenta", tabBarIcon: icons.account }} />
    </Tabs>
  );
}
