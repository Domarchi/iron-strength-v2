import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { NativeWeekController } from "./week-download";
import { weekStorage } from "./week-storage";
import { useSession } from "./session";
const Context = createContext<NativeWeekController | null>(null);
export function WeekDownloadProvider({ userId, children }: PropsWithChildren<{ userId: string }>) {
  const { client } = useSession();
  const [controller] = useState(
    () => new NativeWeekController(userId, weekStorage, () => client.downloadWeek()),
  );
  useEffect(() => {
    void controller.restore();
    return () => controller.dispose();
  }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useWeekDownload() {
  const controller = useContext(Context);
  if (!controller) throw Error("Falta la descarga de semana.");
  const download = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, download };
}
