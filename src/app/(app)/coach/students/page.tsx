import { PageHeading } from "@/components/layout/page-heading";
import { Suspense } from "react";
import { InviteForm } from "./invite-form";
import { PendingInvitations } from "./pending-invitations";
import { StudentsList } from "./students-list";

export const metadata = { title: "Alumnos · Iron Strength" };

export default function StudentsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Alumnos"
        eyebrow="Espacio del coach"
        description="Actividad y cumplimiento de tus alumnos."
      />

      <section aria-labelledby="students-heading" className="flex flex-col gap-4">
        <h2 id="students-heading" className="text-lg font-medium">
          Mis alumnos
        </h2>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
          <StudentsList />
        </Suspense>
      </section>

      <section
        aria-labelledby="invite-heading"
        className="flex flex-col gap-4 rounded-lg border bg-card p-5 sm:p-6"
      >
        <h2 id="invite-heading" className="text-lg font-medium">
          Invitar a un alumno
        </h2>
        <InviteForm />
      </section>

      <section aria-labelledby="pending-heading" className="flex flex-col gap-3">
        <h2 id="pending-heading" className="text-lg font-medium">
          Invitaciones pendientes
        </h2>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
          <PendingInvitations />
        </Suspense>
      </section>
    </div>
  );
}
