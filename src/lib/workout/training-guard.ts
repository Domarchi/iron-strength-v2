import type { DraftStorage } from "./draft";
/** Previous offline interfaces already defer updates while any is:draft: key exists. */
export const trainingGuardKey = (userId: string) => `is:draft:v4:${userId}:training`;
export function hasPreviousTraining(storage: DraftStorage, userId: string) {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (
      key?.startsWith("is:draft:") &&
      key.split(":")[3] === userId &&
      key !== trainingGuardKey(userId)
    )
      return true;
  }
  return false;
}
