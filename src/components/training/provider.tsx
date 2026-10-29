"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { useRouter } from "next/navigation";
import { WebTraining } from "@/lib/workout/web-training";
import {
  createTrainingBrowserStorage,
  reserveTrainingAccount,
} from "@/lib/workout/training-browser";
import { activeOfflineAccount } from "@/lib/offline/account";
import { sendWebTraining, WebSyncError } from "@/lib/workout/web-sync-client";
import { SyncScheduler } from "../../../mobile/src/lib/sync-scheduler";
const Context = createContext<WebTraining | null>(null);
export function WebTrainingProvider({ userId, children }: PropsWithChildren<{ userId: string }>) {
  const [bridge] = useState(
    () =>
      new WebTraining(
        userId,
        createTrainingBrowserStorage(
          userId,
          undefined,
          undefined,
          () => activeOfflineAccount() === userId,
        ),
        (payload) => {
          if (document.visibilityState === "hidden" || !navigator.onLine)
            return Promise.reject(new WebSyncError("unavailable", 503));
          return sendWebTraining(userId, payload);
        },
        () => activeOfflineAccount() === userId,
        () => new Date(),
        () => globalThis.crypto.randomUUID(),
        () => reserveTrainingAccount(userId),
      ),
  );
  useEffect(() => {
    void bridge.restore();
    return () => bridge.dispose();
  }, [bridge]);
  return (
    <Context.Provider value={bridge}>
      <Synchronization bridge={bridge} />
      {children}
    </Context.Provider>
  );
}
function Synchronization({ bridge }: { bridge: WebTraining }) {
  const router = useRouter();
  useEffect(() => {
    const update = () => window.dispatchEvent(new Event("offline-queue"));
    const a = bridge.controller.subscribe(update),
      b = bridge.queue.subscribe(update);
    return () => {
      a();
      b();
    };
  }, [bridge]);
  const training = useSyncExternalStore(
    bridge.controller.subscribe,
    bridge.controller.getSnapshot,
    bridge.controller.getSnapshot,
  );
  const queue = useSyncExternalStore(
    bridge.queue.subscribe,
    bridge.queue.getSnapshot,
    bridge.queue.getSnapshot,
  );
  const reservation = useSyncExternalStore(
    bridge.subscribe,
    bridge.getSnapshot,
    bridge.getSnapshot,
  );
  const scheduler = useRef<SyncScheduler | null>(null);
  useEffect(() => {
    const job = new SyncScheduler(() => bridge.sync(false));
    scheduler.current = job;
    return () => {
      job.dispose();
      if (scheduler.current === job) scheduler.current = null;
    };
  }, [bridge]);
  useEffect(() => {
    const key = [
      training.active?.draft.status === "pending_save" ? training.active.draft.workoutId : "",
      ...queue.entries
        .filter((e) => e.phase === "pending" && !e.error?.blocked)
        .map((e) => e.payload.id),
    ]
      .filter(Boolean)
      .join("|");
    const update = () =>
      scheduler.current?.update({
        active:
          document.visibilityState !== "hidden" &&
          !reservation.reserved &&
          training.ready &&
          queue.ready &&
          !queue.blocked &&
          !training.blocked &&
          activeOfflineAccount() === bridge.userId,
        reachable: navigator.onLine,
        online: navigator.onLine,
        key,
      });
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("offline-account", update);
    window.addEventListener("storage", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("offline-account", update);
      window.removeEventListener("storage", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [
    bridge,
    training.active,
    training.ready,
    training.blocked,
    queue.entries,
    queue.ready,
    queue.blocked,
    reservation.reserved,
    scheduler,
  ]);
  const confirmed = queue.entries
    .filter((e) => e.phase === "confirmed")
    .map((e) => e.payload.id)
    .join(":");
  useEffect(() => {
    if (confirmed) router.refresh();
  }, [confirmed, router]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (training.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [training.dirty]);
  return null;
}
export function useWebTraining() {
  const bridge = useContext(Context);
  if (!bridge) throw Error("Falta el registro web.");
  const training = useSyncExternalStore(
      bridge.controller.subscribe,
      bridge.controller.getSnapshot,
      bridge.controller.getSnapshot,
    ),
    queue = useSyncExternalStore(
      bridge.queue.subscribe,
      bridge.queue.getSnapshot,
      bridge.queue.getSnapshot,
    ),
    reservation = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot);
  return { bridge, training, queue, reservation };
}
