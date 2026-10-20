import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultStartDate, santiagoDate } from "@/domain/dates";
import { formatPrescription } from "@/domain/format";
import {
  isWeekEditable,
  programWeekNumber,
  programState,
  type ProgramRange,
} from "@/domain/program-weeks";
import { listExercises } from "@/lib/data/exercises";
import { getProgramTree } from "@/lib/data/programs";
import { createClient } from "@/lib/supabase/server";
import { addSessionAction, deleteTemplateAction } from "../actions";
import { ActionForm } from "../action-form";
import { AssignForm } from "./assign-form";
import { CopyWeekForm } from "./copy-week-form";
import { SessionEditor } from "./session-editor";
import { CleanEditor, WeekWorkspace } from "./week-workspace";

export const metadata = { title: "Programa · Iron Strength" };

const shortDate = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const formatDay = (date: string) => shortDate.format(new Date(`${date}T00:00:00Z`));

export default async function ProgramEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const tree = await getProgramTree(db, id);
  if (!tree) notFound();

  const today = santiagoDate(new Date());
  const isTemplate = tree.studentId === null;
  const range: ProgramRange | null =
    !isTemplate && tree.startDate && tree.endsOn
      ? { startDate: tree.startDate, endsOn: tree.endsOn, weeksCount: tree.weeksCount }
      : null;
  const currentWeek = range ? programWeekNumber(range, today) : null;
  const state = range ? programState(range, today) : null;

  const anyEditable = Array.from({ length: tree.weeksCount }, (_, i) => i + 1).some((w) =>
    isWeekEditable(range, w, today),
  );
  const [pickerExercises, studentName, assignTargets] = await Promise.all([
    anyEditable
      ? listExercises(db, { limit: 1000 }).then((list) =>
          list.map((e) => ({
            id: e.id,
            name: e.name,
            muscleGroup: e.muscleGroup,
            equipment: e.equipment,
          })),
        )
      : Promise.resolve([]),
    tree.studentId
      ? db
          .from("profiles")
          .select("full_name")
          .eq("id", tree.studentId)
          .maybeSingle()
          .then((r) => r.data?.full_name ?? "Alumno")
      : Promise.resolve(null),
    isTemplate
      ? db
          .from("profiles")
          .select("id, full_name, role")
          .eq("is_active", true)
          .order("role")
          .order("full_name")
          .then((r) =>
            (r.data ?? []).map((p) => ({
              id: p.id,
              label: p.role === "coach" ? `${p.full_name} (yo)` : p.full_name,
            })),
          )
      : Promise.resolve([]),
  ]);

  const weekNumbers = Array.from({ length: tree.weeksCount }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <Button
          variant="ghost"
          className="w-fit -ml-3 text-muted-foreground"
          render={<Link href="/coach/programs" />}
        >
          <ArrowLeft aria-hidden /> Programas
        </Button>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {isTemplate ? "Plantilla" : `Programa de ${studentName}`}
        </p>
        <h1 className="text-xl font-semibold">{tree.name}</h1>
        <p className="text-sm text-muted-foreground">
          {range
            ? `Del ${formatDay(range.startDate)} al ${formatDay(range.endsOn)} · ${state === "active" ? `semana ${currentWeek} de ${tree.weeksCount}` : state === "scheduled" ? "programado" : "terminado"}`
            : `${tree.weeksCount} semanas · Diseña la rutina y luego asígnala a un alumno.`}
        </p>
      </header>
      <WeekWorkspace
        initialWeek={currentWeek ?? 1}
        weeks={weekNumbers.map((week) => ({
          number: week,
          editable: isWeekEditable(range, week, today),
          sessions: tree.sessions.filter((s) => s.weekNumber === week).length,
          exercises: tree.sessions
            .filter((s) => s.weekNumber === week)
            .reduce((n, s) => n + s.exercises.length, 0),
        }))}
        tools={
          isTemplate ? (
            <details className="rounded-lg border bg-card p-4">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
                Asignar a un alumno
              </summary>
              <div className="pt-3">
                <AssignForm
                  templateId={tree.id}
                  targets={assignTargets}
                  defaultStartDate={defaultStartDate(today)}
                />
              </div>
            </details>
          ) : null
        }
        footer={
          isTemplate ? (
            <details className="border-t pt-3">
              <summary className="min-h-11 cursor-pointer py-3 text-xs text-muted-foreground">
                Administrar plantilla
              </summary>
              <ActionForm
                action={deleteTemplateAction}
                fields={{ id: tree.id }}
                label="Eliminar plantilla"
                confirm="¿Eliminar esta plantilla? Los programas ya asignados no se tocan."
                variant="destructive"
              />
            </details>
          ) : null
        }
      >
        {weekNumbers.map((week) => {
          const editable = isWeekEditable(range, week, today);
          const sessions = tree.sessions.filter((s) => s.weekNumber === week);
          const badge = !range
            ? null
            : state === "scheduled"
              ? "Próxima"
              : currentWeek === null || week < currentWeek
                ? "Terminada"
                : week === currentWeek
                  ? "En curso"
                  : "Próxima";
          return (
            <section key={week} aria-labelledby={`week-${week}`} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 id={`week-${week}`} className="flex items-center gap-2 text-lg font-semibold">
                    Semana {week}
                    {badge ? (
                      <span className="rounded-full border px-2 py-1 text-xs font-normal text-muted-foreground">
                        {badge}
                      </span>
                    ) : null}
                  </h2>
                  {!editable ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="size-3.5" aria-hidden /> Semana bloqueada
                    </p>
                  ) : null}
                </div>
                {editable && weekNumbers.length > 1 ? (
                  <details className="rounded-md border px-3">
                    <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium">
                      Copiar desde otra semana
                    </summary>
                    <div className="pb-3">
                      <CleanEditor>
                        <CopyWeekForm
                          programId={tree.id}
                          toWeek={week}
                          otherWeeks={weekNumbers.filter((w) => w !== week)}
                          destinationHasSessions={sessions.length > 0}
                        />
                      </CleanEditor>
                    </div>
                  </details>
                ) : null}
              </div>
              {sessions.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6">
                  <p className="text-sm font-medium">
                    {editable ? "Una semana por diseñar" : "Semana sin sesiones"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {editable
                      ? "Agrega una sesión o copia otra semana. Déjala vacía si es de descarga."
                      : "No hay entrenamiento programado."}
                  </p>
                </div>
              ) : null}
              {sessions.map((session) =>
                editable ? (
                  <SessionEditor
                    userId={tree.coachId}
                    key={session.id}
                    programId={tree.id}
                    session={session}
                    exercises={pickerExercises}
                    canDuplicateSession={sessions.length < 7}
                  />
                ) : (
                  <Card key={session.id}>
                    <CardHeader>
                      <CardTitle className="text-base" role="heading" aria-level={3}>
                        Sesión {session.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ol className="divide-y">
                        {session.exercises.map((exercise) => (
                          <li key={exercise.id} className="py-3 first:pt-0">
                            <p className="text-sm font-medium">{exercise.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatPrescription(exercise)}
                            </p>
                            {exercise.note ? (
                              <p className="mt-1 text-xs text-muted-foreground">{exercise.note}</p>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </CardContent>
                  </Card>
                ),
              )}
              {editable ? (
                <CleanEditor>
                  <ActionForm
                    action={addSessionAction}
                    fields={{ programId: tree.id, weekNumber: String(week) }}
                    label="Agregar sesión"
                    pendingLabel="Agregando…"
                    variant="secondary"
                    disabled={sessions.length >= 7}
                  />
                  {sessions.length >= 7 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Límite de 7 sesiones alcanzado.
                    </p>
                  ) : null}
                </CleanEditor>
              ) : null}
            </section>
          );
        })}
      </WeekWorkspace>
    </div>
  );
}
