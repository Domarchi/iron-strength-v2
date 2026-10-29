import "server-only";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { createClient } from "../supabase/server";
import { readTrainingDownload } from "../data/training-download";
import { saveTypedWorkoutWithAchievements } from "../data/typed-recording-achievements";
import { saveWorkoutRecording } from "../data/save-workout-recording";
import { savePersonalWorkout } from "../data/save-personal-workout";
import { saveWorkout } from "../data/save-workout";
import { syncAchievements } from "../data/achievements";
import { dispatchWebRecording } from "./web-recording-dispatch";
import { createWebTrainingSync } from "./web-sync";
import { createWebTrainingDownload } from "./web-download";
export function webTrainingSync() {
  const post = createWebTrainingSync({
    async authorize() {
      const user = await getCurrentUser();
      if (!user) return null;
      const db = await createClient();
      return {
        userId: user.id,
        async save(payload) {
          const receipt = await dispatchWebRecording(
            {
              typed: (p) => saveTypedWorkoutWithAchievements(db, user.id, p),
              recording: (p) => saveWorkoutRecording(db, p),
              personal: (p) => savePersonalWorkout(db, p),
              legacy: (p) => saveWorkout({ db, payload: p }),
              reconcile: (workoutId) => syncAchievements({ db, studentId: user.id, workoutId }),
            },
            payload,
          );
          return receipt;
        },
      };
    },
  });
  return async (request: Request) => {
    const response = await post(request);
    if (response.ok) {
      // Cache invalidation is optional after the atomic save has confirmed its receipt.
      for (const path of ["/week", "/history", "/progress"]) {
        try {
          revalidatePath(path);
        } catch {
          // Preserve the confirmed JSON response even when the cache is unavailable.
        }
      }
    }
    return response;
  };
}
export function webTrainingDownload() {
  return createWebTrainingDownload({
    async authorize() {
      const user = await getCurrentUser();
      if (!user) return null;
      const db = await createClient();
      return { userId: user.id, read: () => readTrainingDownload(db, user.id) };
    },
  });
}
