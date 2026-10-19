import { santiagoDate } from "@/domain/dates";
import { StudentOverviewList } from "@/components/coach/student-overview-list";
import { listStudentOverviews } from "@/lib/data/students";
import { getUnreadSummary } from "@/lib/data/unread";
import { createClient } from "@/lib/supabase/server";

export async function StudentsList() {
  const db = await createClient();
  const [overviews, unread] = await Promise.all([
    listStudentOverviews(db, santiagoDate(new Date())),
    getUnreadSummary(db).catch(() => null),
  ]);
  const counts = [
    { label: "Alumnos", value: overviews.length },
    { label: "Activos", value: overviews.filter((student) => student.isActive).length },
    {
      label: "Con programa en curso",
      value: overviews.filter((student) => student.week.kind === "active").length,
    },
  ];
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-3 gap-2 sm:gap-4">
        {counts.map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-card p-3 sm:p-4">
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
      <StudentOverviewList
        overviews={overviews}
        unreadByStudent={
          new Map([...(unread?.byStudent ?? [])].map(([id, value]) => [id, value.comments]))
        }
      />
    </div>
  );
}
