import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs } from "expo-router";
import { View, type ColorValue } from "react-native";
import { usePalette } from "../../../components/ui";
import { Icon, type IconName } from "../../../components/icon";
const icon = (name: IconName) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    const p = usePalette();
    return (
      <View
        style={{
          width: 48,
          height: 32,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: focused ? p.tint : "transparent",
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
  const p = usePalette(),
    insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.blue,
        tabBarInactiveTintColor: p.muted,
        tabBarStyle: {
          backgroundColor: p.card,
          borderTopColor: p.border,
          height: 60 + insets.bottom,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 4),
        },
        tabBarItemStyle: { minHeight: 48 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 3 },
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
