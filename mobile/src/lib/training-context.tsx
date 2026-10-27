import { sendQueuedRecording } from "./queued-recording";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { randomUUID } from "expo-crypto";
import { TrainingController } from "./training";
import { atomicStorage } from "./atomic-storage";
import { useSession } from "./session";
const Context = createContext<TrainingController | null>(null);
export function TrainingProvider({ userId, children }: PropsWithChildren<{ userId: string }>) {
  const { client } = useSession();
  const [controller] = useState(
    () =>
      new TrainingController(
        userId,
        atomicStorage,
        (p) => sendQueuedRecording(client, p, userId),
        () => new Date(),
        randomUUID,
      ),
  );
  useEffect(() => {
    void controller.restore();
    return () => controller.dispose();
  }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useTraining() {
  const controller = useContext(Context);
  if (!controller) throw Error("Falta el registro de entrenamiento");
  const training = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, training };
}
