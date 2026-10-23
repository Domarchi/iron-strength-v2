import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../lib/session";
import { Action, Brand, Loading, Notice, Page, usePalette } from "../components/ui";
function Routes() {
  const { client, state } = useSession(),
    p = usePalette();
  if (state.status === "booting") return <Loading />;
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
      </Stack>
    </>
  );
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Routes />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
