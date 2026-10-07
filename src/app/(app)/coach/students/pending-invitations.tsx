import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { revokeInvitationAction } from "./actions";

const formatDate = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeZone: "America/Santiago",
});

function isExpired(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now();
}

export async function PendingInvitations() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, expires_at")
    .is("used_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        No se pudieron cargar las invitaciones.
      </p>
    );
  }
  if (!data.length) {
    return <p className="text-sm text-muted-foreground">No hay invitaciones pendientes.</p>;
  }

  return (
    <ul className="divide-y rounded-lg border">
      {data.map((invitation) => {
        const expired = isExpired(invitation.expires_at);
        return (
          <li key={invitation.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{invitation.email}</p>
              <p className="text-xs text-muted-foreground">
                {expired ? "Vencida el " : "Vence el "}
                {formatDate.format(new Date(invitation.expires_at))}
              </p>
            </div>
            <form action={revokeInvitationAction}>
              <input type="hidden" name="id" value={invitation.id} />
              <Button type="submit" variant="outline">
                Revocar
              </Button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
