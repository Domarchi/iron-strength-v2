import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../lib/session";
import { Action, Brand, Loading, Notice, Page, usePalette } from "../components/ui";
import { AppearanceProvider, useAppearance } from "../lib/appearance-context";
import { AccountRemovalProvider } from "../lib/account-removal-context";
import { AccountRemovalGate } from "../components/account-removal-gate";
function Routes() {
  const { client, state } = useSession(),
    p = usePalette(),
    { ready } = useAppearance();
  if (state.status === "booting" || !ready) return <Loading />;
  if (state.status === "blocked")
    return (
      <Page>
        <Brand />
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
      </Page>
    );
  return (
    <>
      <StatusBar style={p.dark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }}>
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
  return (
    <SafeAreaProvider>
      <AppearanceProvider>
        <SessionProvider>
          <AccountRemovalProvider>
            <AccountRemovalGate>
              <Routes />
            </AccountRemovalGate>
          </AccountRemovalProvider>
        </SessionProvider>
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}
