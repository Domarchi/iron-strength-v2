import { MotionProvider, useReducedMotion } from "../lib/motion-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { startMonitoring } from "../lib/monitoring";
import { AlertsProvider } from "../lib/alerts-context";
import { AppLockProvider } from "../lib/app-lock-context";
import { AppLockGate } from "../components/app-lock-gate";
import { useForjaFonts } from "../ui/fonts";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../lib/session";
import { Action, Notice, usePalette } from "../components/ui";
import { EntryIdentity, EntryLoading, EntryPage } from "../components/entry-screen";
import { AppearanceProvider, useAppearance } from "../lib/appearance-context";
import { AccountRemovalProvider } from "../lib/account-removal-context";
import { AccountRemovalGate } from "../components/account-removal-gate";
function Routes() {
  const reduced = useReducedMotion();
  const { client, state } = useSession(),
    p = usePalette(),
    { ready } = useAppearance();
  if (state.status === "booting" || !ready)
    return (
      <>
        <StatusBar style={p.dark ? "light" : "dark"} />
        <EntryLoading />
      </>
    );
  if (state.status === "blocked")
    return (
      <EntryPage>
        <EntryIdentity />
        <Notice
          message={state.message}
          retry={() => {
            void client.restore();
          }}
        />
        <Action
          label="Salir de este dispositivo"
          secondary
          onPress={() => {
            void client.logout().catch(() => {});
          }}
        />
      </EntryPage>
    );
  return (
    <>
      <StatusBar style={p.dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: reduced ? "none" : "fade",
          animationDuration: 180,
          contentStyle: { backgroundColor: p.bg },
        }}
      >
        <Stack.Protected guard={state.status === "authenticated"}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={state.status === "signedOut"}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Screen name="access" />
        <Stack.Screen name="privacy" />
      </Stack>
    </>
  );
}
startMonitoring();
export default function RootLayout() {
  useForjaFonts();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <MotionProvider>
          <AlertsProvider>
            <AppLockProvider>
              <AppearanceProvider>
                <SessionProvider>
                  <AccountRemovalProvider>
                    <AccountRemovalGate>
                      <AppLockGate>
                        <Routes />
                      </AppLockGate>
                    </AccountRemovalGate>
                  </AccountRemovalProvider>
                </SessionProvider>
              </AppearanceProvider>
            </AppLockProvider>
          </AlertsProvider>
        </MotionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
