import { useSession } from "./session";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useFocusEffect } from "expo-router";
export function useQuery<T>(request: () => Promise<T>) {
  const [value, setValue] = useState<T | null>(null),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const { state, client } = useSession(),
    dataRevision = useSyncExternalStore(
      client.subscribe,
      client.getDataRevision,
      client.getDataRevision,
    ),
    connection =
      state.status === "authenticated" ? state.session.profile.id + ":" + state.mode : state.status;
  const operation = useMemo(
    () => ({ request, revision, connection, dataRevision }),
    [request, revision, connection, dataRevision],
  );
  useFocusEffect(
    useCallback(() => {
      let live = true;
      setLoading(true);
      setError(null);
      operation.request().then(
        (data) => {
          if (live) {
            setValue(data);
            setError(null);
            setLoading(false);
          }
        },
        (e) => {
          if (live) {
            setError(e instanceof Error ? e.message : "No pudimos cargar los datos.");
            setLoading(false);
          }
        },
      );
      return () => {
        live = false;
      };
    }, [operation]),
  );
  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    setRevision((v) => v + 1);
  }, []);
  return { value, error, loading, retry };
}
