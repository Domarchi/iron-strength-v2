import { useCallback, useEffect, useState } from "react";
export function useQuery<T>(request: () => Promise<T>) {
  const [value, setValue] = useState<T | null>(null),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    request().then(
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
  }, [request, revision]);
  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    setRevision((v) => v + 1);
  }, []);
  return { value, error, loading, retry };
}
