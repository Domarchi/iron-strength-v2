import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { randomUUID } from "expo-crypto";
import { PersonalExerciseDraftController } from "./personal-exercise-drafts";
import { atomicStorage } from "./atomic-storage";
import { useSession } from "./session";
const Context = createContext<PersonalExerciseDraftController | null>(null);
export function PersonalExerciseProvider({
  userId,
  children,
}: PropsWithChildren<{ userId: string }>) {
  const { client } = useSession();
  const [controller] = useState(
    () =>
      new PersonalExerciseDraftController(
        userId,
        atomicStorage,
        (input) => client.mutatePersonalExercise(input, userId),
        randomUUID,
      ),
  );
  useEffect(() => {
    void controller.restore();
    return () => controller.dispose();
  }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function usePersonalExerciseDraft() {
  const controller = useContext(Context);
  if (!controller) throw Error("Faltan los ejercicios propios.");
  const exercises = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, exercises };
}
