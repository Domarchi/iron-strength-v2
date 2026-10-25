import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
const activeNow = () => AppState.currentState === "active" || AppState.currentState == null;
export function useSyncEnvironment() {
  const [environment, setEnvironment] = useState<{ active: boolean; reachable: boolean | null }>(
    () => ({ active: activeNow(), reachable: null }),
  );
  const latest = useRef(environment);
  const current = useCallback(() => latest.current, []);
  useEffect(() => {
    let live = true,
      revision = 0;
    const update = (next: typeof environment) => {
      if (!live) return;
      latest.current = next;
      setEnvironment(next);
    };
    const applyNetwork = (value: Network.NetworkState) => {
      const reachable =
        value.isConnected === false || value.isInternetReachable === false
          ? false
          : value.isConnected === true || value.isInternetReachable === true
            ? true
            : null;
      update({ ...latest.current, reachable });
    };
    let network: { remove(): void } | undefined;
    try {
      network = Network.addNetworkStateListener((value) => {
        revision++;
        applyNetwork(value);
      });
    } catch {
      /* Unknown connectivity still permits the authenticated service check. */
    }
    const before = revision;
    void Network.getNetworkStateAsync()
      .then((value) => {
        if (revision === before) applyNetwork(value);
      })
      .catch(() => {});
    const app = AppState.addEventListener("change", (value) =>
      update({ ...latest.current, active: value === "active" }),
    );
    return () => {
      live = false;
      network?.remove();
      app.remove();
    };
  }, []);
  return { environment, current };
}
