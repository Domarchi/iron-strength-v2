import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { DownloadController } from "../../../src/lib/offline/download-controller";
import {
  createTrainingDownloadStorage,
  activateTrainingDownloadAccount,
  deactivateTrainingDownloadAccount,
  trainingDownloadAccountVisible,
  subscribeTrainingDownloadAccount,
} from "./training-download-storage";
import { useSession } from "./session";
const Context = createContext<DownloadController | null>(null);
export function TrainingDownloadProvider({
  userId,
  children,
}: PropsWithChildren<{ userId: string }>) {
  const { client } = useSession();
  const [controller] = useState(() => {
    const owns = () => {
      const current = client.getSnapshot();
      return current.status === "authenticated" && current.session.profile.id === userId;
    };
    return new DownloadController(
      userId,
      createTrainingDownloadStorage(userId, owns),
      () => client.trainingDownload(),
      owns,
    );
  });
  useEffect(() => {
    activateTrainingDownloadAccount(userId);
    void controller.restore();
    return () => {
      controller.dispose();
      deactivateTrainingDownloadAccount(userId);
    };
  }, [controller, userId]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useTrainingDownload() {
  const controller = useContext(Context),
    { state } = useSession();
  if (!controller) throw Error("Falta la descarga de entrenamiento.");
  const download = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const visible = useSyncExternalStore(
    subscribeTrainingDownloadAccount,
    () => trainingDownloadAccountVisible(controller.userId),
    () => true,
  );
  const owns =
    visible && state.status === "authenticated" && state.session.profile.id === controller.userId;
  return { controller, download, owns, bundle: owns && download.verified ? download.bundle : null };
}
