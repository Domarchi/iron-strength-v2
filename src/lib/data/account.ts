// Borrar la propia cuenta (RF-48; DC-4, DC-32). Orden obligatorio: primero los ARCHIVOS de fotos, con la
// sesión del propio alumno (la política de Storage lo permite), y solo si todo salió bien se llama a la
// función de la base que borra el usuario y, en cascada, todo lo demás. Si falla el borrado de fotos,
// no se toca la cuenta y se puede reintentar. No usa la clave de servicio.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.ts";
import { BUCKET } from "./photos";

type Client = SupabaseClient<Database>;

export type DeleteAccountResult =
  { ok: true } | { ok: false; reason: "photos" | "forbidden" | "failed" };

const PAGE = 100;

// Todos los archivos de la carpeta del alumno, incluso los que no tengan fila registrada.
async function listOwnFiles(db: Client, userId: string): Promise<string[] | null> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.storage
      .from(BUCKET)
      .list(userId, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) return null;
    paths.push(...data.filter((f) => f.id !== null).map((f) => `${userId}/${f.name}`));
    if (data.length < PAGE) return paths;
  }
}

export async function deleteOwnAccount(db: Client): Promise<DeleteAccountResult> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { ok: false, reason: "forbidden" };
  const userId = auth.user.id;

  const files = await listOwnFiles(db, userId);
  if (files === null) return { ok: false, reason: "photos" };

  if (files.length > 0) {
    const { data: removed, error } = await db.storage.from(BUCKET).remove(files);
    if (error || (removed?.length ?? 0) < files.length) return { ok: false, reason: "photos" };
  }

  const { error } = await db.rpc("delete_my_account");
  if (error) return { ok: false, reason: error.code === "42501" ? "forbidden" : "failed" };
  return { ok: true };
}
