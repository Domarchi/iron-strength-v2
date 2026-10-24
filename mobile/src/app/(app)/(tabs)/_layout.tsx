import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { usePalette } from "../../../components/ui";
const icon = (symbol: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return (
      <Text aria-hidden accessible={false} style={{ color, fontSize: 23 }}>
        {symbol}
      </Text>
    );
  };

const icons = {
  home: icon("⌂"),
  train: icon("◈"),
  history: icon("▤"),
  progress: icon("↗"),
  account: icon("○"),
};
export default function TabLayout() {
  const p = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.blue,
        tabBarInactiveTintColor: p.muted,
        tabBarStyle: { backgroundColor: p.card, borderTopColor: p.border },
        tabBarItemStyle: { minHeight: 48 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
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
