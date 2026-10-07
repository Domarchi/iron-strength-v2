import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { setStudentActiveAction } from "./actions";
import { ResetLinkButton } from "./reset-link-button";

export async function StudentsList() {
  const supabase = await createClient();
  // La RLS devuelve solo a los alumnos de este coach. El coach no aparece aquí (DC-22).
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, is_active")
    .eq("role", "student")
    .order("full_name");

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        No se pudieron cargar los alumnos.
      </p>
    );
  }
  if (!data.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no tienes alumnos. Invita al primero con el formulario de arriba.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {data.map((student) => (
        <li key={student.id} className="flex flex-col gap-3 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{student.full_name}</p>
              <p className="text-xs text-muted-foreground">
                {student.is_active ? "Activo" : "Desactivado"}
              </p>
            </div>
            <form action={setStudentActiveAction}>
              <input type="hidden" name="id" value={student.id} />
              <input type="hidden" name="active" value={String(!student.is_active)} />
              <Button type="submit" variant={student.is_active ? "outline" : "secondary"}>
                {student.is_active ? "Desactivar" : "Reactivar"}
              </Button>
            </form>
          </div>
          <ResetLinkButton studentId={student.id} studentName={student.full_name} />
        </li>
      ))}
    </ul>
  );
}
