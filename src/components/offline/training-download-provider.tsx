"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { DownloadController, DownloadFault } from "@/lib/offline/download-controller";
import { prepareCompleteOfflineInterface } from "@/lib/offline/interface";
import { createIndexedDownloadStorage } from "@/lib/offline/indexed-download-storage";
import { readWebTrainingDownload } from "@/lib/offline/web-download-client";
import { activeOfflineAccount, subscribeOfflineAccount } from "@/lib/offline/account";
function createDownload(userId: string) {
  const owns = () => activeOfflineAccount() === userId;
  const storage = createIndexedDownloadStorage(userId, owns);
  const controller = new DownloadController(
    userId,
    storage,
    async () => {
      try {
        await prepareCompleteOfflineInterface();
      } catch {
        throw new DownloadFault("interface");
      }
      return readWebTrainingDownload(userId);
    },
    owns,
  );
  // Suspense may hydrate a child after restore finishes. Hydration must still see
  // the original server snapshot, then subscribe to the current verified state.
  const serverSnapshot = controller.getSnapshot();
  return {
    controller,
    getServerSnapshot: () => serverSnapshot,
    // Account operations already own trainingAccountLock and must not acquire it a second time.
    async clearReserved(confirmedAccountDeletion = false) {
      if (!controller.getSnapshot().reserved)
        throw Error("Reserva primero la descarga de esta cuenta.");
      return storage.clearReserved(confirmedAccountDeletion);
    },
  };
}
const Context = createContext<ReturnType<typeof createDownload> | null>(null);
export function WebTrainingDownloadProvider({
  userId,
  children,
}: PropsWithChildren<{ userId: string }>) {
  const [bridge] = useState(() => createDownload(userId));
  useEffect(() => {
    void bridge.controller.restore();
    return () => bridge.controller.dispose();
  }, [bridge]);
  return <Context.Provider value={bridge}>{children}</Context.Provider>;
}
export function useWebTrainingDownload() {
  const bridge = useContext(Context);
  if (!bridge) throw Error("Falta la descarga de entrenamiento web.");
  const download = useSyncExternalStore(
    bridge.controller.subscribe,
    bridge.controller.getSnapshot,
    bridge.getServerSnapshot,
  );
  const owns = useSyncExternalStore(
    subscribeOfflineAccount,
    () => activeOfflineAccount() === bridge.controller.userId,
    () => false,
  );
  return { bridge, download, owns, bundle: owns && download.verified ? download.bundle : null };
}
