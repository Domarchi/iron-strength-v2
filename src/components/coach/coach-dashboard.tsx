"use client";
import { NativeSelect } from "@/components/ui/native-select";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { coachSignals } from "@/domain/coach-signals";
import { summarizeUnread, type UnreadRow } from "@/domain/unread";
import type { StudentOverview } from "@/lib/data/students";
import { StudentOverviewList } from "./student-overview-list";
export function CoachDashboard({
  overviews,
  unread,
  today,
}: {
  overviews: StudentOverview[];
  unread: UnreadRow[] | null;
  today: string;
}) {
  const [studentId, setStudentId] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const activeFilter = overviews.some((s) => s.id === studentId) ? studentId : "";
  const selected = activeFilter ? overviews.filter((s) => s.id === activeFilter) : overviews;
  const signals = selected.flatMap((student) =>
    coachSignals(student, today, unread ?? []).map((signal) => ({ ...signal, student })),
  );
  const counts = summarizeUnread(unread ?? []).byStudent;
  return (
    <div className="flex flex-col gap-5">
      <label htmlFor="coach-student-filter" className="text-sm font-medium">
        Filtrar por alumno
      </label>
      <NativeSelect
        id="coach-student-filter"
        className="-mt-3"
        value={activeFilter}
        onChange={(e) => setStudentId(e.target.value)}
      >
        <option value="">Todos los alumnos</option>
        {overviews.map((s) => (
          <option key={s.id} value={s.id}>
            {s.fullName}
          </option>
        ))}
      </NativeSelect>
      <section aria-labelledby="coach-signals-heading" className="rounded-lg border bg-card p-4">
        <h3 id="coach-signals-heading" className="font-semibold">
          Para revisar
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Señales informativas. Los programas y las cargas los decides tú.
        </p>
        {unread === null ? (
          <div role="alert" className="mt-3 rounded border p-3 text-sm">
            <p>No se pudieron cargar los comentarios pendientes.</p>
            <Button
              variant="outline"
              className="mt-2"
              disabled={pending}
              onClick={() => startTransition(() => router.refresh())}
            >
              {pending ? "Actualizando…" : "Actualizar panel"}
            </Button>
          </div>
        ) : null}
        {signals.length ? (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {signals.map((signal) => (
              <li key={`${signal.student.id}-${signal.kind}`} className="min-w-0">
                <Link
                  href={signal.href}
                  className="flex min-h-11 min-w-0 flex-col gap-1 rounded-md break-words border p-3 hover:bg-muted/50"
                >
                  <span className="text-xs text-muted-foreground">{signal.student.fullName}</span>
                  <span className="text-sm font-semibold text-primary">{signal.label}</span>
                  <span className="text-xs text-muted-foreground">{signal.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {unread === null
              ? "Sin otras señales para revisar."
              : "Sin señales pendientes para esta selección."}
          </p>
        )}
      </section>
      <p role="status" className="text-xs text-muted-foreground">
        {selected.length} de {overviews.length} alumnos
      </p>
      <StudentOverviewList
        overviews={selected}
        unreadByStudent={new Map([...counts].map(([id, value]) => [id, value.comments]))}
      />
    </div>
  );
}
