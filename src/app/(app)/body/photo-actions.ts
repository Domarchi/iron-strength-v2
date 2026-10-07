"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { deletePhoto, registerPhoto } from "@/lib/data/photos";
import { createClient } from "@/lib/supabase/server";

export type RegisterPhotoOutcome = { ok: true } | { ok: false; message: string };

// El navegador sube el archivo directo a Storage (con su sesión); aquí solo se registra y valida.
export async function registerPhotoAction(input: {
  path: string;
  takenOn: string;
  tag: string | null;
}): Promise<RegisterPhotoOutcome> {
  const user = await requireUser();
  const result = await registerPhoto({
    db: await createClient(),
    studentId: user.id,
    takenOn: input.takenOn,
    tag: input.tag || null,
    storagePath: input.path,
  });

  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "too_many"
          ? "Ya subiste 3 fotos para ese día. Elige otra fecha o borra una."
          : result.reason === "forbidden"
            ? "No tienes permiso para subir fotos."
            : "No se pudo guardar la foto. Revisa la fecha y que el archivo sea una imagen válida.",
    };
  }
  revalidatePath("/body");
  return { ok: true };
}

export async function deletePhotoAction(formData: FormData): Promise<void> {
  await requireUser();
  await deletePhoto({ db: await createClient(), id: String(formData.get("id") ?? "") });
  revalidatePath("/body");
}
