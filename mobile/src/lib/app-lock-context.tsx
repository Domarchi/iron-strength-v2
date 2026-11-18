import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState, Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { readAppLock, saveAppLock, shouldLock } from "./app-lock-prefs";
import { trainingStorage } from "./training-storage";

type State = {
  enabled: boolean;
  locked: boolean;
  ready: boolean;
  busy: boolean;
  error: string | null;
  supported: boolean;
  unlock(): Promise<void>;
  setEnabled(value: boolean): Promise<void>;
};
const Context = createContext<State | null>(null);
const native = Platform.OS !== "web";

async function available() {
  return (
    native &&
    (await LocalAuthentication.hasHardwareAsync()) &&
    (await LocalAuthentication.isEnrolledAsync())
  );
}
async function verify(message: string) {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: message,
    cancelLabel: "Cancelar",
  });
  return result.success;
}

export function AppLockProvider({ children }: PropsWithChildren) {
  const [enabled, setEnabledState] = useState(false),
    [locked, setLocked] = useState(false),
    [ready, setReady] = useState(!native),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const enabledRef = useRef(false),
    backgroundedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!native) return;
    let live = true;
    readAppLock(trainingStorage)
      .then(async (value) => {
        // Si el teléfono ya no tiene verificación configurada no dejamos a nadie fuera.
        const usable = value && (await available().catch(() => false));
        if (!live) return;
        enabledRef.current = usable;
        setEnabledState(usable);
        setLocked(usable);
      })
      .catch(() => {
        if (live)
          setError(
            "No pudimos leer el bloqueo. Conservamos el dato; puedes elegir un ajuste para reemplazarlo.",
          );
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!native) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background" || next === "inactive") {
        backgroundedAt.current ??= Date.now();
        return;
      }
      if (
        shouldLock({
          enabled: enabledRef.current,
          backgroundedAtMs: backgroundedAt.current,
          nowMs: Date.now(),
        })
      )
        setLocked(true);
      backgroundedAt.current = null;
    });
    return () => sub.remove();
  }, []);
  const unlock = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (await verify("Desbloquear Iron Strength")) setLocked(false);
      else setError("No pudimos verificar que eres tú. Intenta de nuevo.");
    } catch {
      setError("No pudimos abrir la verificación del teléfono. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }, []);
  const setEnabled = useCallback(async (value: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (value) {
        if (!(await available())) {
          setError(
            "Este teléfono no tiene huella, rostro o código configurado. Actívalo en los ajustes del teléfono.",
          );
          return;
        }
        if (!(await verify("Confirma para activar el bloqueo"))) {
          setError("No se activó el bloqueo porque no se pudo verificar.");
          return;
        }
      }
      await saveAppLock(trainingStorage, value);
      enabledRef.current = value;
      setEnabledState(value);
      setLocked(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar el bloqueo.");
    } finally {
      setBusy(false);
    }
  }, []);
  return (
    <Context.Provider
      value={{ enabled, locked, ready, busy, error, supported: native, unlock, setEnabled }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAppLock() {
  const value = useContext(Context);
  if (!value) throw new Error("AppLockProvider ausente");
  return value;
}
