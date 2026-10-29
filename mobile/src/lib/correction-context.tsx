import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { randomUUID } from "expo-crypto";
import { WorkoutCorrectionController } from "../../../src/lib/workout/correction-draft";
import { atomicStorage } from "./atomic-storage";
import { useSession } from "./session";
const Context = createContext<WorkoutCorrectionController | null>(null);
export function CorrectionProvider({ userId, children }: PropsWithChildren<{ userId: string }>) {
  const { client } = useSession();
  const [controller] = useState(
    () =>
      new WorkoutCorrectionController(
        userId,
        atomicStorage,
        (input) => client.correctWorkout(input, userId),
        randomUUID,
      ),
  );
  useEffect(() => {
    void controller.restore();
    return () => controller.dispose();
  }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useCorrectionDraft() {
  const controller = useContext(Context);
  if (!controller) throw Error("Falta la recuperación de correcciones.");
  const correction = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, correction };
}
