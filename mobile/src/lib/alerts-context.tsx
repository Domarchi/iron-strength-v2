import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { defaultAlerts, readAlerts, saveAlerts, type AlertsPrefs } from "./alerts-prefs";
import {
  cancelDailyReminder,
  cancelNotification,
  notificationsSupported,
  requestNotificationPermission,
  scheduleDailyReminder,
  scheduleRestEnd,
} from "./notifications";
import { trainingStorage } from "./training-storage";

type State = {
  prefs: AlertsPrefs;
  ready: boolean;
  busy: boolean;
  error: string | null;
  supported: boolean;
  setRestEnd(value: boolean): Promise<void>;
  setReminder(next: Partial<AlertsPrefs["reminder"]>): Promise<void>;
};
const Context = createContext<State | null>(null);

export function AlertsProvider({ children }: PropsWithChildren) {
  const [prefs, setPrefs] = useState<AlertsPrefs>(defaultAlerts),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const prefsRef = useRef(prefs);
  useEffect(() => {
    let live = true;
    readAlerts(trainingStorage)
      .then((value) => {
        if (!live) return;
        prefsRef.current = value;
        setPrefs(value);
        if (value.reminder.enabled)
          void scheduleDailyReminder(value.reminder.hour, value.reminder.minute).catch(() => {});
      })
      .catch(() => {
        if (live)
          setError(
            "No pudimos leer tus avisos. Conservamos el dato; puedes elegir un ajuste para reemplazarlo.",
          );
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  const commit = useCallback(async (next: AlertsPrefs, apply?: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await saveAlerts(trainingStorage, next);
      prefsRef.current = next;
      setPrefs(next);
      await apply?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar el aviso.");
    } finally {
      setBusy(false);
    }
  }, []);
  const denied =
    "No tienes permiso para avisos. Actívalo en los ajustes del teléfono y vuelve a intentar.";
  const setRestEnd = useCallback(
    async (value: boolean) => {
      if (value && !(await requestNotificationPermission().catch(() => false))) {
        setError(denied);
        return;
      }
      await commit({ ...prefsRef.current, restEnd: value });
    },
    [commit],
  );
  const setReminder = useCallback(
    async (change: Partial<AlertsPrefs["reminder"]>) => {
      const reminder = { ...prefsRef.current.reminder, ...change };
      if (change.enabled && !(await requestNotificationPermission().catch(() => false))) {
        setError(denied);
        return;
      }
      await commit({ ...prefsRef.current, reminder }, () =>
        reminder.enabled
          ? scheduleDailyReminder(reminder.hour, reminder.minute)
          : cancelDailyReminder(),
      );
    },
    [commit],
  );
  return (
    <Context.Provider
      value={{
        prefs,
        ready,
        busy,
        error,
        supported: notificationsSupported,
        setRestEnd,
        setReminder,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAlerts() {
  const value = useContext(Context);
  if (!value) throw new Error("AlertsProvider ausente");
  return value;
}

/** Programa el aviso de fin de descanso y lo reprograma solo si el término cambió (ajustes de ±15 s). */
export function useRestEndAlert(seconds: number) {
  const { prefs, supported } = useAlerts(),
    enabled = prefs.restEnd && supported;
  const current = useRef<{ id: string | null; end: number } | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const id = current.current?.id ?? null;
      current.current = null;
      void cancelNotification(id);
    };
  }, []);
  useEffect(() => {
    if (!enabled || seconds <= 0) {
      const id = current.current?.id ?? null;
      current.current = null;
      void cancelNotification(id);
      return;
    }
    const end = Date.now() + seconds * 1000;
    if (current.current && Math.abs(current.current.end - end) < 3000) return;
    void cancelNotification(current.current?.id ?? null);
    const entry = { id: null as string | null, end };
    current.current = entry;
    void scheduleRestEnd(seconds)
      .then((id) => {
        if (!mounted.current || current.current !== entry) void cancelNotification(id);
        else entry.id = id;
      })
      .catch(() => {});
  }, [enabled, seconds]);
}
