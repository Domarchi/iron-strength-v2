import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { useColorScheme } from "react-native";
import {
  palettes,
  readAppearance,
  resolveAppearance,
  saveAppearance,
  type AppearancePreference,
} from "./appearance";
import { trainingStorage } from "./training-storage";

type AppearanceState = {
  preference: AppearancePreference;
  ready: boolean;
  busy: boolean;
  error: string | null;
  saved: boolean;
  choose: (preference: AppearancePreference) => Promise<void>;
};
const Context = createContext<AppearanceState | null>(null);
export function AppearanceProvider({ children }: PropsWithChildren) {
  const [preference, setPreference] = useState<AppearancePreference>("system"),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [saved, setSaved] = useState(false);
  const writing = useRef(false);
  useEffect(() => {
    let live = true;
    readAppearance(trainingStorage)
      .then((value) => {
        if (live) setPreference(value);
      })
      .catch(() => {
        if (live)
          setError(
            "No pudimos leer tu tema. Conservamos el dato local; puedes elegir un ajuste para reemplazarlo.",
          );
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  async function choose(next: AppearancePreference) {
    if (!ready || writing.current) return;
    writing.current = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saveAppearance(trainingStorage, next);
      setPreference(next);
      setSaved(true);
    } catch {
      setError("No pudimos guardar el tema. Se mantiene tu ajuste anterior.");
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  return (
    <Context.Provider value={{ preference, ready, busy, error, saved, choose }}>
      {children}
    </Context.Provider>
  );
}
export function useAppearance() {
  const value = useContext(Context);
  if (!value) throw new Error("Falta AppearanceProvider");
  return value;
}
export function usePalette() {
  const { preference } = useAppearance(),
    system = useColorScheme();
  return palettes[resolveAppearance(preference, system)];
}
