import Storage from "expo-sqlite/kv-store";
import { createNativeDownloadStorage } from "../../../src/lib/offline/native-download-storage";
import { runStorageOperation } from "./training-storage";
export const createTrainingDownloadStorage = (userId: string, owns: () => boolean) =>
  createNativeDownloadStorage(userId, Storage, runStorageOperation, owns);
export const activateTrainingDownloadAccount = (userId: string) => Boolean(userId);
export function deactivateTrainingDownloadAccount(userId: string) {
  void userId;
}
export const trainingDownloadAccountVisible = (userId: string) => Boolean(userId);
export function subscribeTrainingDownloadAccount(notify: () => void) {
  void notify;
  return () => {};
}
export async function clearConfirmedTrainingDownload(userId: string) {
  return createTrainingDownloadStorage(userId, () => true).clearReserved(true);
}
