import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { randomUUID } from "expo-crypto";
import { LibraryDraftController } from "./library-drafts";
import { atomicStorage } from "./atomic-storage";
import { useSession } from "./session";
const Context = createContext<LibraryDraftController | null>(null);
export function LibraryProvider({ userId, children }: PropsWithChildren<{ userId: string }>) {
  const { client } = useSession();
  const [controller] = useState(
    () =>
      new LibraryDraftController(
        userId,
        atomicStorage,
        (input) => client.mutatePersonalLibrary(input, userId),
        randomUUID,
      ),
  );
  useEffect(() => {
    void controller.restore();
    return () => controller.dispose();
  }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useLibraryDrafts() {
  const controller = useContext(Context);
  if (!controller) throw Error("Falta la biblioteca personal.");
  const library = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, library };
}
