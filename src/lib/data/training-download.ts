import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../types/database";
import { projectCompleteTrainingDownload } from "../../domain/training-download";
export type TrainingDownloadCode = "capacity" | "unauthorized" | "incompatible" | "unavailable";
export class TrainingDownloadError extends Error {
  constructor(readonly code: TrainingDownloadCode) {
    super(
      code === "capacity"
        ? "La descarga supera el límite de esta versión. Conservamos tu copia anterior."
        : code === "unauthorized"
          ? "Vuelve a iniciar sesión. Conservamos tu copia anterior."
          : code === "incompatible"
            ? "La descarga requiere una versión compatible. Conservamos tu copia anterior."
            : "No pudimos completar la descarga. Conservamos tu copia anterior.",
    );
    this.name = "TrainingDownloadError";
  }
}
export function projectTrainingDownload(value: unknown, owner: string) {
  try {
    return projectCompleteTrainingDownload(value, z.uuid().parse(owner).toLowerCase());
  } catch {
    throw new TrainingDownloadError("incompatible");
  }
}
/** Caller identity was verified by the API; SQL also derives ownership from auth.uid(). */
export async function readTrainingDownload(db: SupabaseClient<Database>, owner: string) {
  if (!z.uuid().safeParse(owner).success) throw new TrainingDownloadError("incompatible");
  let response;
  try {
    response = await db.rpc("get_own_training_download");
  } catch {
    throw new TrainingDownloadError("unavailable");
  }
  if (response.error)
    throw new TrainingDownloadError(
      response.error.code === "0A000"
        ? "capacity"
        : response.error.code === "42501"
          ? "unauthorized"
          : "unavailable",
    );
  return projectTrainingDownload(response.data, owner);
}
