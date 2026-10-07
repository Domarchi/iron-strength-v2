import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listPhotos } from "@/lib/data/photos";
import { createClient } from "@/lib/supabase/server";
import { deletePhotoAction } from "./photo-actions";

const dateFormat = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

// Fotos del alumno con enlaces firmados de 5 minutos. El coach las ve, pero no puede borrarlas.
export async function PhotoGallery({
  studentId,
  readOnly,
}: {
  studentId: string;
  readOnly: boolean;
}) {
  const photos = await listPhotos(await createClient(), studentId);

  if (photos.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay fotos de progreso.</p>;
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo) => {
        const label = `${dateFormat.format(new Date(`${photo.takenOn}T00:00:00Z`))}${photo.tag ? ` · ${photo.tag}` : ""}`;
        return (
          <li key={photo.id} className="flex flex-col gap-1">
            {/* Enlace firmado y temporal: no pasa por el optimizador de imágenes de Next. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={`Foto de progreso, ${label}`}
              loading="lazy"
              className="aspect-[3/4] w-full rounded-lg border object-cover"
            />
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              {readOnly ? null : (
                <form action={deletePhotoAction}>
                  <input type="hidden" name="id" value={photo.id} />
                  <Button
                    type="submit"
                    size="icon"
                    variant="ghost"
                    aria-label={`Borrar la foto del ${label}`}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </form>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
