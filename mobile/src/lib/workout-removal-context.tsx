import { MobileError } from "./client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { randomUUID } from "expo-crypto";
import { WorkoutRemovalController } from "../../../src/lib/workout/removal-draft";
import { atomicStorage } from "./atomic-storage";
import { useCorrectionDraft } from "./correction-context";
import { useSession } from "./session";
const Context = createContext<WorkoutRemovalController | null>(null);
export function WorkoutRemovalProvider({
  userId,
  children,
}: PropsWithChildren<{ userId: string }>) {
  const { client } = useSession(),
    { controller: corrections } = useCorrectionDraft();
  const [controller] = useState(
    () =>
      new WorkoutRemovalController(userId, atomicStorage, {
        uuid: randomUUID,
        send: async (input) => {
          const active = client.getSnapshot();
          if (active.status !== "authenticated" || active.session.profile.id !== userId)
            throw new MobileError(
              "identity",
              "La cuenta cambió. Conservamos el intento en su cuenta original.",
            );
          // Only reached by an explicit confirm/retry after protecting the frozen request.
          if (active.mode === "offline") await client.reconnect();
          return client.removeWorkout(input, userId);
        },
        reserve: async (workoutId) => {
          const release = corrections.reserveForWorkoutRemoval(workoutId);
          try {
            await corrections.flush();
            return release;
          } catch (error) {
            release();
            throw error;
          }
        },
        onRemoved: (workoutId) => corrections.clearRemovedWorkout(workoutId),
      }),
  );
  useEffect(() => {
    void controller.restore();
    return () => controller.dispose();
  }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useWorkoutRemoval() {
  const controller = useContext(Context);
  if (!controller) throw Error("Falta la recuperación de eliminaciones.");
  const removal = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, removal };
}
