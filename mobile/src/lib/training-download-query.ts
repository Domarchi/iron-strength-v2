import { useCallback } from "react";
import type { Bundle } from "../../../src/lib/offline/training-bundle";
import { useTrainingDownload } from "./training-download-context";
import { useQuery } from "./use-query";
import { useSession } from "./session";
function useDownloadedQuery<T>(request: () => Promise<T>, select: (bundle: Bundle) => T | null) {
  const { state } = useSession(),
    { bundle, download } = useTrainingDownload();
  const offline = state.status === "authenticated" && state.mode === "offline";
  const local = bundle ? select(bundle) : null;
  const error =
    download.error?.message ??
    "Estos datos no están descargados. Conecta y descarga tus entrenamientos.";
  const q = useQuery(
    useCallback(
      () => (offline ? (local ? Promise.resolve(local) : Promise.reject(Error(error))) : request()),
      [offline, local, error, request],
    ),
  );
  return offline
    ? {
        ...q,
        value: local,
        error: !download.ready || local ? null : error,
        loading: !download.ready,
        downloadedAt: bundle?.downloadedAt ?? null,
      }
    : { ...q, downloadedAt: null };
}
const catalog = (b: Bundle) => b.catalog;
const library = (b: Bundle) => b.library;
export function useTrainingCatalogQuery() {
  const { client } = useSession();
  return useDownloadedQuery(
    useCallback(() => client.trainingCatalog(), [client]),
    catalog,
  );
}
export function useTrainingLibraryQuery() {
  const { client } = useSession();
  return useDownloadedQuery(
    useCallback(() => client.trainingLibrary(), [client]),
    library,
  );
}
export function useTrainingExerciseQuery(id: string) {
  const { client } = useSession();
  return useDownloadedQuery(
    useCallback(() => client.trainingExerciseDetail(id), [client, id]),
    useCallback((b: Bundle) => b.history[id] ?? null, [id]),
  );
}
