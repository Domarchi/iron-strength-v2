import { createContext, useCallback, useContext, useState } from "react";
import { useReducedMotion } from "../../../lib/motion-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs } from "expo-router";
import { Platform, Text, View, useWindowDimensions, type ColorValue } from "react-native";
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
const LabelHeightContext = createContext<(label: string, height: number) => void>(() => {});
function TabLabel({ color, children }: { color: ColorValue; children: string }) {
  const reportHeight = useContext(LabelHeightContext);
  return (
    <Text
      allowFontScaling
      onLayout={(event) => reportHeight(children, event.nativeEvent.layout.height)}
      style={{
        color,
        fontFamily: Platform.OS === "web" ? "system-ui, Helvetica, Arial, sans-serif" : undefined,
        fontSize: 11,
        lineHeight: 16,
        fontWeight: "500",
        marginTop: 2,
        textAlign: "center",
        alignSelf: "stretch",
      }}
    >
      {children}
    </Text>
  );
}
function renderTabLabel(props: { color: ColorValue; children: string }) {
  return <TabLabel {...props} />;
}
export default function TabLayout() {
  const reduced = useReducedMotion();
  const [labelHeights, setLabelHeights] = useState<Record<string, number>>({});
  const reportHeight = useCallback((label: string, height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    setLabelHeights((current) => {
      if (height <= 16.5) {
        if (!(label in current)) return current;
        const next = { ...current };
        delete next[label];
        return next;
      }
      if (Math.abs((current[label] ?? 0) - height) < 0.5) return current;
      return { ...current, [label]: height };
    });
  }, []);
  const p = usePalette(),
    insets = useSafeAreaInsets(),
    { fontScale } = useWindowDimensions();
  return (
    <LabelHeightContext.Provider value={reportHeight}>
      <Tabs
        screenOptions={{
          headerShown: false,
          animation: reduced ? "none" : "fade",
          transitionSpec: { animation: "timing", config: { duration: reduced ? 0 : 160 } },
          sceneStyle: { backgroundColor: p.bg },
          tabBarActiveTintColor: p.blue,
          tabBarInactiveTintColor: p.muted,
          tabBarAllowFontScaling: true,
          tabBarLabel: renderTabLabel,
          tabBarStyle: {
            backgroundColor: p.bg,
            borderTopColor: p.border,
            height:
              Math.max(
                66,
                Math.ceil(50 + 16 * fontScale),
                Math.ceil(50 + Math.max(16, ...Object.values(labelHeights))),
              ) + insets.bottom,
            paddingTop: 4,
            paddingBottom: Math.max(insets.bottom, 4),
          },
          tabBarItemStyle: { minHeight: 48 },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Inicio", tabBarIcon: icons.home }} />
        <Tabs.Screen name="train" options={{ title: "Entrenar", tabBarIcon: icons.train }} />
        <Tabs.Screen name="history" options={{ title: "Historial", tabBarIcon: icons.history }} />
        <Tabs.Screen name="progress" options={{ title: "Progreso", tabBarIcon: icons.progress }} />
        <Tabs.Screen name="account" options={{ title: "Cuenta", tabBarIcon: icons.account }} />
      </Tabs>
    </LabelHeightContext.Provider>
  );
}
