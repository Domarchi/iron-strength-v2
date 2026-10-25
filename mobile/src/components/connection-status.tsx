import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSession } from "../lib/session";
import { usePalette } from "../lib/appearance-context";
function OfflineConnection() {
  const p = usePalette(),
    { client } = useSession(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await client.reconnect();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos confirmar la conexión.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View
      style={{
        gap: 8,
        borderWidth: 1,
        borderColor: p.border,
        backgroundColor: p.card,
        borderRadius: 12,
        padding: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 13, lineHeight: 19, color: p.muted, flex: 1, minWidth: 130 }}>
          Usando datos de este dispositivo
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Conectar"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={() => {
            void connect();
          }}
          style={{
            minHeight: 48,
            minWidth: 80,
            paddingHorizontal: 12,
            paddingVertical: 12,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            backgroundColor: p.button,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ fontSize: 14, lineHeight: 21, fontWeight: "600", color: "#fff" }}>
              Conectar
            </Text>
          )}
        </Pressable>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={{ fontSize: 14, lineHeight: 21, color: p.danger }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
export function ConnectionStatus() {
  const { state } = useSession();
  return state.status === "authenticated" && state.mode === "offline" ? (
    <OfflineConnection />
  ) : null;
}
