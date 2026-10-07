// Fotos de progreso (RF-40 a RF-43, DC-18). El archivo vive en el bucket privado `progress-photos`
// bajo la carpeta de su dueño; aquí se guardan los metadatos y se entregan SIEMPRE con enlaces
// firmados de 5 minutos. La RLS (tabla y Storage) decide quién ve y quién borra.
import type { SupabaseClient } from "@supabase/supabase-js";
import { santiagoDate, type DateString } from "../../domain/dates.ts";
import { PHOTO_TAGS, photoFileSchema } from "../../domain/schemas.ts";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;

export const BUCKET = "progress-photos";
export const SIGNED_URL_SECONDS = 300;

export type Photo = {
  id: string;
  takenOn: DateString;
  tag: string | null;
  sizeBytes: number;
  url: string;
};

export type RegisterPhotoResult =
  { ok: true; id: string } | { ok: false; reason: "invalid" | "too_many" | "forbidden" };

export async function registerPhoto(args: {
  db: Client;
  studentId: string;
  takenOn: string;
  tag: string | null;
  storagePath: string;
}): Promise<RegisterPhotoResult> {
  const { db, studentId, takenOn, tag, storagePath } = args;

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(takenOn) ||
    Number.isNaN(Date.parse(takenOn)) ||
    takenOn > santiagoDate(new Date())
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (tag !== null && !(PHOTO_TAGS as readonly string[]).includes(tag))
    return { ok: false, reason: "invalid" };
  // Debe estar en la carpeta del propio alumno (la política de Storage se apoya en esto).
  if (
    !storagePath.startsWith(`${studentId}/`) ||
    storagePath.slice(studentId.length + 1).includes("/")
  ) {
    return { ok: false, reason: "invalid" };
  }

  // El tamaño y el tipo se toman del archivo realmente subido, no de lo que declare el cliente.
  const fileName = storagePath.slice(studentId.length + 1);
  const { data: files, error: listError } = await db.storage
    .from(BUCKET)
    .list(studentId, { search: fileName, limit: 5 });
  if (listError) throw new Error(`No se pudo comprobar la foto: ${listError.message}`);
  const stored = files.find((f) => f.name === fileName);
  const size = Number((stored?.metadata as { size?: number } | null)?.size ?? 0);
  const type = String((stored?.metadata as { mimetype?: string } | null)?.mimetype ?? "");
  if (!stored || !photoFileSchema.safeParse({ type, size }).success)
    return { ok: false, reason: "invalid" };

  const { data, error } = await db
    .from("progress_photos")
    .insert({
      student_id: studentId,
      taken_on: takenOn,
      tag,
      storage_path: storagePath,
      size_bytes: size,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "42501") return { ok: false, reason: "forbidden" };
    if (error.code === "23514") {
      return { ok: false, reason: /Máximo 3 fotos/i.test(error.message) ? "too_many" : "invalid" };
    }
    throw new Error(`No se pudo registrar la foto: ${error.message}`);
  }
  return { ok: true, id: data.id };
}

export async function listPhotos(db: Client, studentId: string): Promise<Photo[]> {
  const { data, error } = await db
    .from("progress_photos")
    .select("id, taken_on, tag, size_bytes, storage_path")
    .eq("student_id", studentId)
    .order("taken_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las fotos: ${error.message}`);
  if (data.length === 0) return [];

  const { data: signed, error: signError } = await db.storage.from(BUCKET).createSignedUrls(
    data.map((p) => p.storage_path),
    SIGNED_URL_SECONDS,
  );
  if (signError) throw new Error(`No se pudieron firmar las fotos: ${signError.message}`);
  const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));

  return data.flatMap((p) => {
    const url = urlByPath.get(p.storage_path);
    return url ? [{ id: p.id, takenOn: p.taken_on, tag: p.tag, sizeBytes: p.size_bytes, url }] : [];
  });
}

// Borra primero el archivo (solo el dueño puede, por la política de Storage) y luego la fila.
export async function deletePhoto(args: {
  db: Client;
  id: string;
}): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  const { data: photo, error } = await args.db
    .from("progress_photos")
    .select("id, storage_path")
    .eq("id", args.id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la foto: ${error.message}`);
  if (!photo) return { ok: false, reason: "not_found" };

  const { data: removed, error: removeError } = await args.db.storage
    .from(BUCKET)
    .remove([photo.storage_path]);
  if (removeError) throw new Error(`No se pudo borrar el archivo: ${removeError.message}`);
  // Si la política no deja borrar (p. ej. el coach), no se elimina nada: Storage devuelve 0 objetos.
  if (removed.length === 0) return { ok: false, reason: "not_found" };

  const { error: rowError } = await args.db.from("progress_photos").delete().eq("id", args.id);
  if (rowError) throw new Error(`No se pudo borrar el registro de la foto: ${rowError.message}`);
  return { ok: true };
}
