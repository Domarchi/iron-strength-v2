"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PHOTO_TAGS } from "@/domain/schemas";
import { createClient } from "@/lib/supabase/client";
import { BUCKET } from "@/lib/data/photos";
import { processImage } from "@/lib/photos/image";
import { registerPhotoAction } from "./photo-actions";

export function PhotoUploader({ userId, today }: { userId: string; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Elige una foto.");
      return;
    }

    setBusy(true);
    setError(null);
    setDone(false);
    const supabase = createClient();
    let uploadedPath: string | null = null;
    try {
      // 1) Se reduce y convierte en el dispositivo (≤ 1280 px, WebP, ≤ 1 MB).
      const photo = await processImage(file);

      // 2) Sube directo a la carpeta propia del bucket privado.
      uploadedPath = `${userId}/${crypto.randomUUID()}.${photo.extension}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(uploadedPath, photo.blob, {
          contentType: photo.type,
        });
      if (uploadError)
        throw new Error("No se pudo subir la foto. Revisa tu conexión e inténtalo de nuevo.");

      // 3) Se registra; si falla, no queda un archivo huérfano.
      const outcome = await registerPhotoAction({
        path: uploadedPath,
        takenOn: String(data.get("takenOn")),
        tag: String(data.get("tag") ?? "") || null,
      });
      if (!outcome.ok) {
        await supabase.storage.from(BUCKET).remove([uploadedPath]);
        uploadedPath = null;
        throw new Error(outcome.message);
      }
      form.reset();
      setDone(true);
      router.refresh();
    } catch (cause) {
      if (uploadedPath) await supabase.storage.from(BUCKET).remove([uploadedPath]);
      setError(cause instanceof Error ? cause.message : "No se pudo subir la foto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="photo-file">Foto</Label>
        <Input
          id="photo-file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          required
          className="h-auto min-h-11 py-2"
        />
        <p className="text-xs text-muted-foreground">
          Se reduce en tu dispositivo antes de subirla (máximo 1 MB) y solo la ven tú y tu coach.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="photo-date">Fecha</Label>
          <Input
            id="photo-date"
            name="takenOn"
            type="date"
            max={today}
            defaultValue={today}
            required
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="photo-tag">Vista (opcional)</Label>
          <NativeSelect id="photo-tag" name="tag" defaultValue="">
            <option value="">Sin etiqueta</option>
            {PHOTO_TAGS.map((tag) => (
              <option key={tag} value={tag}>
                {tag.charAt(0).toUpperCase() + tag.slice(1)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="text-sm text-primary">
          Foto guardada.
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Procesando y subiendo…" : "Subir foto"}
      </Button>
    </form>
  );
}
