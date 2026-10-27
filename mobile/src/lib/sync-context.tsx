import { isPersonalWorkoutPayload, isRecordingPayload } from "./personal-training";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { NativeWorkoutQueue } from "./sync-queue";
import { atomicStorage } from "./atomic-storage";
import { useTraining } from "./training-context";
import { useSession } from "./session";
import { handoffPending } from "./queue-transfer";
import { SyncScheduler } from "./sync-scheduler";
import { useSyncEnvironment } from "./sync-environment";
function useWorkoutSync(userId: string) {
  const { client, state: session } = useSession(),
    { controller: source, training } = useTraining(),
    { environment, current } = useSyncEnvironment();
  const [controller] = useState(
    () =>
      new NativeWorkoutQueue(userId, atomicStorage, (payload) =>
        isRecordingPayload(payload)
          ? client.saveRecording(payload, userId)
          : isPersonalWorkoutPayload(payload)
            ? client.savePersonalWorkout(payload, userId)
            : client.saveWorkout(payload, userId),
      ),
  );
  const queue = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [transferring, setTransferring] = useState(false),
    [syncing, setSyncing] = useState(false),
    [error, setError] = useState<string | null>(null),
    [paused, setPaused] = useState(false);
  const live = useRef(true),
    transfer = useRef<Promise<unknown> | null>(null),
    transferFailure = useRef<string | null>(null),
    running = useRef<Promise<boolean> | null>(null),
    exiting = useRef(false);
  const canSend = useCallback(() => {
    const e = current(),
      s = client.getSnapshot();
    return (
      live.current &&
      !exiting.current &&
      e.active &&
      e.reachable !== false &&
      s.status === "authenticated" &&
      s.session.profile.id === userId &&
      s.mode === "online"
    );
  }, [client, current, userId]);
  const archive = useCallback((): Promise<unknown> => {
    if (transfer.current) return transfer.current;
    const s = source.getSnapshot(),
      q = controller.getSnapshot();
    if (
      !live.current ||
      exiting.current ||
      transferFailure.current ||
      !s.ready ||
      s.blocked ||
      s.busy ||
      s.closing ||
      s.dirty ||
      s.active?.mode !== "real" ||
      s.active.draft.status !== "pending_save" ||
      !q.ready ||
      !q.verified ||
      q.blocked ||
      q.busy
    )
      return Promise.resolve(null);
    setTransferring(true);
    const epoch = controller.generation();
    const operation = handoffPending(source, controller).catch((e) => {
      if (!controller.isCurrent(epoch)) return null;
      const message =
        e instanceof Error
          ? e.message
          : "No pudimos mover el cierre a la cola. Conservamos el original.";
      transferFailure.current = message;
      if (live.current) setError(message);
      throw e;
    });
    transfer.current = operation;
    void operation
      .finally(() => {
        if (transfer.current === operation) transfer.current = null;
        if (live.current) setTransferring(false);
      })
      .catch(() => {});
    return operation;
  }, [controller, source]);
  const perform = useCallback(
    (manual = false): Promise<boolean> => {
      if (running.current) return running.current;
      const operation = (async () => {
        const e = current(),
          s = client.getSnapshot();
        if (
          !live.current ||
          exiting.current ||
          !e.active ||
          e.reachable === false ||
          s.status !== "authenticated" ||
          s.session.profile.id !== userId
        )
          return false;
        setSyncing(true);
        setError(null);
        try {
          if (s.mode === "offline") await client.reconnect();
          if (!canSend()) return false;
          await archive();
          const q = controller.getSnapshot();
          if (!q.ready || !q.verified || q.blocked || q.busy || transferFailure.current)
            return false;
          await controller.sync({ manual, canContinue: canSend });
          const after = client.getSnapshot(),
            a = source.getSnapshot();
          return (
            after.status === "authenticated" &&
            after.session.profile.id === userId &&
            (after.mode === "offline" ||
              (a.active?.mode === "real" && a.active.draft.status === "pending_save") ||
              controller
                .getSnapshot()
                .entries.some((item) => item.phase === "pending" && !item.error?.blocked))
          );
        } catch (error) {
          if (live.current)
            setError(
              error instanceof Error ? error.message : "No pudimos confirmar la sincronización.",
            );
          return live.current && !controller.getSnapshot().blocked && !transferFailure.current;
        } finally {
          if (live.current) setSyncing(false);
        }
      })();
      running.current = operation;
      void operation
        .finally(() => {
          if (running.current === operation) running.current = null;
        })
        .catch(() => {});
      return operation;
    },
    [archive, canSend, client, controller, current, source, userId],
  );
  const scheduler = useRef<SyncScheduler | null>(null);
  useEffect(() => {
    live.current = true;
    const job = new SyncScheduler(perform);
    scheduler.current = job;
    void controller.restore();
    return () => {
      live.current = false;
      job.dispose();
      if (scheduler.current === job) scheduler.current = null;
      controller.dispose();
    };
  }, [controller, perform]);
  useEffect(() => {
    if (environment.reachable === false) client.connectionLost();
  }, [client, environment.reachable, session]);
  useEffect(() => {
    if (environment.active && !paused) void archive().catch(() => {});
  }, [
    archive,
    transferring,
    paused,
    environment.active,
    training.active,
    training.busy,
    training.closing,
    training.dirty,
    queue.ready,
    queue.verified,
    queue.blocked,
    queue.busy,
  ]);
  const online = session.status === "authenticated" && session.mode === "online";
  const sourcePending =
    training.active?.mode === "real" && training.active.draft.status === "pending_save"
      ? training.active.draft.workoutId
      : "";
  const key = [
    online ? "" : "connection",
    sourcePending,
    ...queue.entries.filter((item) => item.phase === "pending").map((item) => item.payload.id),
  ]
    .filter(Boolean)
    .join("|");
  useEffect(() => {
    scheduler.current?.update({
      active: environment.active && queue.ready && !paused,
      reachable: environment.reachable,
      online,
      key,
    });
  }, [perform, environment.active, environment.reachable, queue.ready, online, key, paused]);
  const recover = useCallback(async () => {
    if (!live.current || exiting.current)
      throw Error("La cuenta cambió. Conservamos los registros.");
    if (transfer.current || running.current)
      throw Error("Espera a que termine el guardado o envío.");
    if (source.getSnapshot().dirty) await source.retryStorage();
    if (!live.current) throw Error("La cuenta cambió. Conservamos los registros.");
    await controller.restore();
    if (!live.current) throw Error("La cuenta cambió. Conservamos los registros.");
    transferFailure.current = null;
    setError(null);
    await archive();
  }, [archive, controller, source]);
  const synchronize = useCallback(() => scheduler.current?.manual() ?? Promise.resolve(null), []);
  const discard = useCallback(
    async (id: string) => {
      if (transfer.current || running.current || controller.getSnapshot().busy)
        throw Error("Espera a que termine el guardado o envío.");
      const a = source.getSnapshot().active;
      if (a?.mode === "real" && a.draft.workoutId === id) await source.discard();
      await controller.discard(id);
      transferFailure.current = null;
      setError(null);
    },
    [controller, source],
  );
  const flush = useCallback(async () => {
    if (transfer.current || running.current)
      throw Error("Espera a que termine el guardado o envío.");
    await controller.flush();
  }, [controller]);
  const clearForLogout = useCallback(async () => {
    if (transfer.current || running.current)
      throw Error("Espera a que termine el guardado o envío.");
    await controller.clearForLogout();
  }, [controller]);
  const pause = useCallback(() => {
    if (exiting.current || transfer.current || running.current || controller.getSnapshot().busy)
      throw Error("Espera a que termine el guardado o envío.");
    exiting.current = true;
    setPaused(true);
    scheduler.current?.update({
      active: false,
      reachable: current().reachable,
      online: false,
      key: "",
    });
    return () => {
      exiting.current = false;
      if (live.current) setPaused(false);
    };
  }, [controller, current]);
  return {
    controller,
    queue,
    transferring,
    syncing,
    error,
    recover,
    synchronize,
    discard,
    flush,
    clearForLogout,
    pause,
    paused,
  };
}
type ContextValue = ReturnType<typeof useWorkoutSync>;
const Context = createContext<ContextValue | null>(null);
export function WorkoutSyncProvider({ userId, children }: PropsWithChildren<{ userId: string }>) {
  const value = useWorkoutSync(userId);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkoutSyncQueue() {
  const value = useContext(Context);
  if (!value) throw Error("Falta la cola de entrenamientos.");
  return value;
}
