import { PublicInfoLinks } from "@/components/layout/public-info-links";
import { ThemeSelect } from "@/components/layout/theme-select";
import { PageHeading } from "@/components/layout/page-heading";
import { Download, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { LogoutForm } from "@/components/offline/logout-form";
import { DeleteAccount } from "./delete-account";

export const metadata = { title: "Mi cuenta · Iron Strength" };

const ROLE_LABEL = { coach: "Coach", student: "Alumno" } as const;

// Mi cuenta (RF-64): datos básicos, exportar el propio historial, cerrar sesión y, solo para alumnos,
// borrar la cuenta (RF-48).
export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="flow-page flex flex-col gap-6">
      <PageHeading
        title="Mi cuenta"
        eyebrow="Tu espacio"
        description="Gestiona tu cuenta y tus datos."
      />

      <section aria-label="Datos de la cuenta" className="rounded-lg border bg-card p-5 sm:p-6">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Nombre</dt>
          <dd className="font-medium">{user.fullName}</dd>
          <dt className="text-muted-foreground">Correo</dt>
          <dd className="font-medium break-all">{user.email}</dd>
          <dt className="text-muted-foreground">Rol</dt>
          <dd className="font-medium">{ROLE_LABEL[user.role]}</dd>
        </dl>
      </section>

      <ThemeSelect />

      <section aria-labelledby="export-heading" className="flex flex-col gap-2">
        <h2 id="export-heading" className="text-lg font-medium">
          Mis datos
        </h2>
        <p className="text-sm text-muted-foreground">
          Descarga todo tu historial de entrenamientos en un archivo que se abre en Excel.
        </p>
        <div>
          <Button variant="outline" render={<a href="/export/history" download />}>
            <Download aria-hidden /> Exportar mi historial (CSV)
          </Button>
        </div>
      </section>

      <LogoutForm userId={user.id}>
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          <LogOut aria-hidden /> Cerrar sesión
        </Button>
      </LogoutForm>

      {user.role === "student" ? <DeleteAccount userId={user.id} /> : null}
      <PublicInfoLinks />
    </div>
  );
}
