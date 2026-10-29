"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getAssignedTrainingContext } from "@/lib/data/assigned-training-context";
import { saveTypedWorkoutRecording } from "@/lib/data/typed-recordings";
import { createAssignedWebOperations } from "@/lib/workout/assigned-web-operations";

function operations() {
  return createAssignedWebOperations({
    async authorize() {
      const user = await getCurrentUser();
      if (!user) return null;
      const db = await createClient();
      return {
        userId: user.id.toLowerCase(),
        read: (id) => getAssignedTrainingContext(db, user.id, id),
        save: (payload) => saveTypedWorkoutRecording(db, payload),
      };
    },
  });
}
export async function readAssignedTrainingAction(value: unknown) {
  return operations().read(value);
}
export async function saveAssignedTrainingAction(value: unknown) {
  const result = await operations().save(value);
  if (result.ok)
    for (const path of ["/week", "/history", "/progress", `/history/${result.value.workoutId}`])
      revalidatePath(path);
  return result;
}
