"use client";
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { WorkoutCorrectionController } from "@/lib/workout/correction-draft";
import { WorkoutRemovalController } from "@/lib/workout/removal-draft";
import { createCorrectionBrowserStorage } from "@/lib/workout/correction-browser";
import { activeOfflineAccount } from "@/lib/offline/account";
import {
  correctWorkoutAction,
  removeWorkoutAction,
  readCorrectionAction,
  readRemovalAction,
  type WorkoutChangeResult,
} from "@/app/(app)/history/[id]/actions";
function dispatch<T>(call: () => Promise<WorkoutChangeResult<T>>): Promise<T> {
  return new Promise((resolve, reject) => {
    startTransition(async () => {
      try {
        const result = await call();
        if (result.ok) resolve(result.value);
        else reject(Object.assign(Error(result.message), { code: result.code }));
      } catch (error) {
        reject(error);
      }
    });
  });
}
function createChanges(userId: string) {
  const storage = createCorrectionBrowserStorage(),
    uuid = () => window.crypto.randomUUID();
  function own() {
    if (activeOfflineAccount() !== userId)
      throw Error("La cuenta cambió. Conservamos los cambios para su cuenta original.");
  }
  const corrections = new WorkoutCorrectionController(
    userId,
    storage,
    (input) => {
      own();
      return dispatch(() => correctWorkoutAction(input));
    },
    uuid,
  );
  const removals = new WorkoutRemovalController(userId, storage, {
    uuid,
    send: (input) => {
      own();
      return dispatch(() => removeWorkoutAction(input));
    },
    reserve: async (id) => {
      own();
      const release = corrections.reserveForWorkoutRemoval(id);
      try {
        await corrections.flush();
        own();
        return release;
      } catch (error) {
        release();
        throw error;
      }
    },
    onRemoved: (id) => corrections.clearRemovedWorkout(id),
  });
  const reserve = () => {
    own();
    const releaseRemoval = removals.pauseWrites();
    let releaseCorrection: (() => void) | undefined;
    try {
      releaseCorrection = corrections.pauseWrites();
    } catch (error) {
      releaseRemoval();
      throw error;
    }
    return () => {
      releaseCorrection?.();
      releaseRemoval();
    };
  };
  async function reserveAccountDeletion() {
    const release = reserve();
    try {
      if (!corrections.getSnapshot().blocked) await corrections.flush();
      if (!removals.getSnapshot().blocked) await removals.flush();
      own();
      return release;
    } catch (error) {
      release();
      throw error;
    }
  }
  return {
    corrections,
    removals,
    readCorrection: (id: string) => {
      own();
      return dispatch(() => readCorrectionAction(id));
    },
    readRemoval: (id: string) => {
      own();
      return dispatch(() => readRemovalAction(id));
    },
    reserveAccountDeletion,
    async reserveExit() {
      const release = await reserveAccountDeletion();
      try {
        const c = corrections.getSnapshot(),
          r = removals.getSnapshot();
        if (c.blocked || r.blocked || c.pending || c.draft?.changed || r.pending)
          throw Error(
            "Revisa la corrección o eliminación pendiente desde Historial antes de salir. Conservamos sus datos.",
          );
        await corrections.clearForLogout();
        await removals.clearForLogout();
        own();
        return release;
      } catch (error) {
        release();
        throw error;
      }
    },
  };
}
const Context = createContext<ReturnType<typeof createChanges> | null>(null);
export function WorkoutChangesProvider({
  userId,
  children,
}: PropsWithChildren<{ userId: string }>) {
  const [changes] = useState(() => createChanges(userId));
  useEffect(() => {
    void changes.corrections.restore();
    void changes.removals.restore();
    return () => {
      changes.corrections.dispose();
      changes.removals.dispose();
    };
  }, [changes]);
  return <Context.Provider value={changes}>{children}</Context.Provider>;
}
export function useWorkoutChanges() {
  const changes = useContext(Context);
  if (!changes) throw Error("Falta la recuperación de cambios de entrenamiento.");
  const correction = useSyncExternalStore(
    changes.corrections.subscribe,
    changes.corrections.getSnapshot,
    changes.corrections.getSnapshot,
  );
  const removal = useSyncExternalStore(
    changes.removals.subscribe,
    changes.removals.getSnapshot,
    changes.removals.getSnapshot,
  );
  return { ...changes, correction, removal };
}
