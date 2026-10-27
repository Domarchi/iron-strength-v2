import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { TrainingPreferencesController } from "./training-preferences";
import { atomicStorage } from "./atomic-storage";
const Context = createContext<TrainingPreferencesController | null>(null);
export function TrainingPreferencesProvider({
  userId,
  children,
}: PropsWithChildren<{ userId: string }>) {
  const [controller] = useState(() => new TrainingPreferencesController(userId, atomicStorage));
  useEffect(() => {
    void controller.restore();
  }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useTrainingPreferences() {
  const controller = useContext(Context);
  if (!controller) throw Error("Faltan las preferencias de entrenamiento.");
  const preferences = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, preferences };
}
