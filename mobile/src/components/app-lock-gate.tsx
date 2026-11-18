import { useEffect, type PropsWithChildren } from "react";
import { Text, View } from "react-native";
import { useAppLock } from "../lib/app-lock-context";
import { useSession } from "../lib/session";
import { Brand, Notice, usePalette, Action, s } from "./ui";

/** Cubre la app con una pantalla de bloqueo cuando hay sesión y el bloqueo está activo. */
export function AppLockGate({ children }: PropsWithChildren) {
  const lock = useAppLock(),
    { state } = useSession(),
    p = usePalette();
  const show = lock.ready && lock.locked && state.status === "authenticated";
  useEffect(() => {
    if (show) void lock.unlock();
    // Solo al aparecer el bloqueo; los reintentos son manuales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);
  if (!show) return <>{children}</>;
  return (
    <View
      accessibilityViewIsModal
      style={{
        flex: 1,
        backgroundColor: p.bg,
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: 24,
      }}
    >
      <Brand />
      <Text accessibilityRole="header" style={[s.heading, { color: p.ink, textAlign: "center" }]}>
        Iron Strength bloqueado
      </Text>
      <Text style={[s.body, { color: p.muted, textAlign: "center" }]}>
        Verifica que eres tú para ver tus entrenamientos.
      </Text>
      {lock.error ? <Notice message={lock.error} /> : null}
      <View style={{ width: "100%", maxWidth: 360 }}>
        <Action label="Desbloquear" busy={lock.busy} onPress={() => void lock.unlock()} />
      </View>
    </View>
  );
}
