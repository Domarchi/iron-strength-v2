import { createIndexedDownloadStorage } from "../../../src/lib/offline/indexed-download-storage";
import { DownloadFault } from "../../../src/lib/offline/download-controller";
import { trainingAccountLock } from "../../../src/lib/workout/training-browser";
import {
  activeOfflineAccount,
  subscribeOfflineAccount,
  setOfflineAccount,
} from "../../../src/lib/offline/account";
export const createTrainingDownloadStorage = (userId: string, owns: () => boolean) =>
  createIndexedDownloadStorage(userId, () => owns() && activeOfflineAccount() === userId);
export const activateTrainingDownloadAccount = setOfflineAccount;
export const trainingDownloadAccountVisible = (userId: string) => activeOfflineAccount() === userId;
export const subscribeTrainingDownloadAccount = subscribeOfflineAccount;
export function deactivateTrainingDownloadAccount(userId: string) {
  if (activeOfflineAccount() === userId) setOfflineAccount(null);
}
export async function clearConfirmedTrainingDownload(userId: string) {
  if (!navigator.locks) throw new DownloadFault("unsupported");
  return navigator.locks.request(trainingAccountLock(userId), async () => {
    const result = await createIndexedDownloadStorage(userId, () => true).clearReserved(true);
    if (activeOfflineAccount() === userId && !setOfflineAccount(null))
      throw new DownloadFault("storage");
    return result;
  });
}
