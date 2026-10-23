import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { MobileClient, validateApiOrigin } from "./client";
import { credentialStore } from "./credential-store";
const SessionContext = createContext<MobileClient | null>(null);
export function SessionProvider({ children }: PropsWithChildren) {
  const [client] = useState(() => {
    const origin = validateApiOrigin(
      process.env.EXPO_PUBLIC_API_URL ?? "https://iron-strength-seven.vercel.app",
      __DEV__ && process.env.EXPO_PUBLIC_ALLOW_LOCAL_API === "1",
    );
    return new MobileClient(
      origin,
      credentialStore(origin),
      fetch,
      Date.now,
      __DEV__ && process.env.EXPO_PUBLIC_ALLOW_LOCAL_API === "1",
    );
  });
  useEffect(() => {
    void client.restore();
  }, [client]);
  return <SessionContext.Provider value={client}>{children}</SessionContext.Provider>;
}
export function useSession() {
  const client = useContext(SessionContext);
  if (!client) throw Error("Falta el contexto de sesión");
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return { client, state };
}
