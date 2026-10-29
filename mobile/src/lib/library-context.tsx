import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { randomUUID } from "expo-crypto";
import { TypedLibraryDraftController } from "./typed-library-drafts";
import { atomicStorage } from "./atomic-storage";
import { useSession } from "./session";
const Context = createContext<TypedLibraryDraftController | null>(null);
export function LibraryProvider({ userId, children }: PropsWithChildren<{ userId: string }>) {
  const { client } = useSession();
  const [controller] = useState(
    () =>
      new TypedLibraryDraftController(
        userId,
        atomicStorage,
        (input) =>
          input.version === 2
            ? client.mutateTrainingLibrary(input, userId)
            : client.mutatePersonalLibrary(input, userId),
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
