import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addCommentAction, deleteCommentAction } from "@/app/(app)/history/[id]/comment-actions";
import type { CommentItem } from "@/lib/data/comments";
import { cn } from "@/lib/utils";
import { CommentForm } from "./comment-form";

const when = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Santiago",
});

// Comentarios de un entrenamiento (RF-36): los ven y escriben el alumno y su coach.
export function CommentsSection({
  workoutId,
  comments,
  viewerRole,
}: {
  workoutId: string;
  comments: CommentItem[];
  viewerRole: "coach" | "student";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comentarios</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {viewerRole === "coach"
              ? "Escribe un comentario sobre este entrenamiento."
              : "Tu coach o tú pueden comentar este entrenamiento."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {comments.map((c) => (
              <li
                key={c.id}
                className={cn("flex flex-col gap-1 rounded-lg border p-3", c.mine && "bg-muted/40")}
              >
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    <strong className="text-foreground">
                      {c.mine ? "Tú" : c.authorKind === "coach" ? "Coach" : "Alumno"}
                    </strong>{" "}
                    · {when.format(new Date(c.createdAt))}
                  </span>
                  {c.mine ? (
                    <form action={deleteCommentAction.bind(null, workoutId)}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button
                        type="submit"
                        size="icon"
                        variant="ghost"
                        aria-label="Borrar mi comentario"
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </form>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap text-sm">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <CommentForm action={addCommentAction.bind(null, workoutId)} />
      </CardContent>
    </Card>
  );
}
