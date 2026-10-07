"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { CommentState } from "@/app/(app)/history/[id]/comment-actions";

export function CommentForm({
  action,
}: {
  action: (prev: CommentState, formData: FormData) => Promise<CommentState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Label htmlFor="comment-body">Escribe un comentario</Label>
      <textarea
        id="comment-body"
        name="body"
        rows={3}
        maxLength={500}
        required
        className="min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
      />
      <p className="text-xs text-muted-foreground">
        Hasta 500 caracteres. Los comentarios no se pueden editar, solo borrar.
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Publicando…" : "Publicar comentario"}
        </Button>
      </div>
    </form>
  );
}
