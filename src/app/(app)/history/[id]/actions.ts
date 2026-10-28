"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { readOwnWorkoutCorrection, correctOwnWorkout } from "@/lib/data/workout-corrections";
import { readOwnWorkoutRemoval, removeOwnWorkout } from "@/lib/data/workout-removals";
import {
  workoutCorrectionSchema,
  workoutCorrectionSnapshotSchema,
  workoutCorrectionReceiptSchema,
} from "@/lib/mobile/workout-correction-contracts";
import {
  workoutRemovalSchema,
  workoutRemovalSnapshotSchema,
  workoutRemovalReceiptSchema,
} from "@/lib/mobile/workout-removal-contracts";
type Code =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_input"
  | "conflict"
  | "edit_locked"
  | "unavailable";
export type WorkoutChangeResult<T> =
  { ok: true; value: T } | { ok: false; code: Code; message: string };
const messages: Record<Code, string> = {
  unauthorized: "Vuelve a iniciar sesión. Conservamos los cambios en este dispositivo.",
  forbidden: "Tu cuenta no tiene acceso a esta operación.",
  not_found: "Ese entrenamiento ya no está disponible para tu cuenta.",
  invalid_input: "Revisa los datos del entrenamiento.",
  conflict: "El entrenamiento cambió. Conserva tu propuesta y revisa la versión actual.",
  edit_locked: "Terminó el plazo de siete días para modificar este entrenamiento.",
  unavailable: "No pudimos confirmar la operación. Conserva el intento y reintenta con conexión.",
};
const uuid = z.uuid().transform((v) => v.toLowerCase());
const failure = (code: Code) => ({ ok: false as const, code, message: messages[code] });
async function respond<T>(
  operation: (db: Awaited<ReturnType<typeof createClient>>, owner: string) => Promise<T>,
): Promise<WorkoutChangeResult<T>> {
  try {
    const user = await getCurrentUser();
    if (!user) return failure("unauthorized");
    return { ok: true, value: await operation(await createClient(), user.id.toLowerCase()) };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    const mapped: Code =
      code === "40001"
        ? "conflict"
        : code === "55000"
          ? "edit_locked"
          : code === "42501"
            ? "forbidden"
            : code === "P0002"
              ? "not_found"
              : code === "22023" || code === "23514"
                ? "invalid_input"
                : "unavailable";
    return failure(mapped);
  }
}
function unavailable(): never {
  throw Error("No se confirmó esta operación.");
}
function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw Object.assign(Error("Solicitud inválida"), { code: "22023" });
  return result.data;
}
function missing(): never {
  throw Object.assign(Error("No disponible"), { code: "P0002" });
}
function revalidate(id: string) {
  for (const path of ["/history", `/history/${id}`, "/week", "/progress"]) revalidatePath(path);
}
export async function readCorrectionAction(id: unknown) {
  return respond(async (db, owner) => {
    const wid = parseInput(uuid, id),
      value = await readOwnWorkoutCorrection(db, wid, owner);
    if (value === null) missing();
    const parsed = workoutCorrectionSnapshotSchema.safeParse(value);
    if (!parsed.success || parsed.data.userId !== owner || parsed.data.workout.id !== wid)
      unavailable();
    return parsed.data;
  });
}
export async function readRemovalAction(id: unknown) {
  return respond(async (db, owner) => {
    const wid = parseInput(uuid, id),
      value = await readOwnWorkoutRemoval(db, wid, owner);
    if (value === null) missing();
    const parsed = workoutRemovalSnapshotSchema.safeParse(value);
    if (!parsed.success || parsed.data.userId !== owner || parsed.data.workout.id !== wid)
      unavailable();
    return parsed.data;
  });
}
export async function correctWorkoutAction(input: unknown) {
  return respond(async (db) => {
    const request = parseInput(workoutCorrectionSchema, input),
      receipt = workoutCorrectionReceiptSchema.safeParse(await correctOwnWorkout(db, request));
    if (
      !receipt.success ||
      receipt.data.requestId !== request.requestId ||
      receipt.data.workoutId !== request.workoutId ||
      receipt.data.revision <= request.expectedRevision
    )
      unavailable();
    revalidate(request.workoutId);
    return receipt.data;
  });
}
export async function removeWorkoutAction(input: unknown) {
  return respond(async (db) => {
    const request = parseInput(workoutRemovalSchema, input),
      receipt = workoutRemovalReceiptSchema.safeParse(await removeOwnWorkout(db, request));
    if (
      !receipt.success ||
      receipt.data.requestId !== request.requestId ||
      receipt.data.workoutId !== request.workoutId ||
      receipt.data.revision <= request.expectedRevision
    )
      unavailable();
    revalidate(request.workoutId);
    return receipt.data;
  });
}
