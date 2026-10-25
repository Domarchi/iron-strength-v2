import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { AccountRemovalController, clearAccountTraining } from "./account-removal";
import { trainingStorage } from "./training-storage";
import { useSession } from "./session";
const Context = createContext<AccountRemovalController | null>(null);
export function AccountRemovalProvider({ children }: PropsWithChildren) {
  const { client } = useSession();
  const [controller] = useState(
    () =>
      new AccountRemovalController(trainingStorage, async (userId) => {
        await clearAccountTraining(trainingStorage, userId);
        const session = client.getSnapshot();
        if (session.status === "booting" || session.status === "blocked")
          throw Error(
            "Primero comprueba la sesión o confirma la salida de este dispositivo. Conservamos el recibo de limpieza.",
          );
        if (session.status === "authenticated" && session.session.profile.id === userId)
          await client.logout();
      }),
  );
  useEffect(() => {
    void controller.restore();
  }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useAccountRemoval() {
  const controller = useContext(Context);
  if (!controller) throw Error("Falta la gestión de eliminación.");
  const removal = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, removal };
}
