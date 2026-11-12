import { MotionProvider, useReducedMotion } from "../lib/motion-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
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
export default function RootLayout() {
  useForjaFonts();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <MotionProvider>
          <AppearanceProvider>
            <SessionProvider>
              <AccountRemovalProvider>
                <AccountRemovalGate>
                  <Routes />
                </AccountRemovalGate>
              </AccountRemovalProvider>
            </SessionProvider>
          </AppearanceProvider>
        </MotionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
