import { navigationContext, studentHref, adaptHref } from "@/lib/navigation/training-context";
import { TrainingPrescriptionSummary } from "@/components/coach/training-prescription-summary";
import { WEEKDAYS } from "@/domain/session-schedule";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth/session";
import { OrphanDraftRecovery } from "./orphan-draft-recovery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultStartDate, santiagoDate } from "@/domain/dates";
import {
  isWeekEditable,
  programWeekNumber,
  programState,
  type ProgramRange,
} from "@/domain/program-weeks";
import { getCoachProgramTree, listCoachCatalog } from "@/lib/data/coach-programs";
import { createClient } from "@/lib/supabase/server";
import { addSessionAction, deleteTemplateAction } from "../actions";
import { ActionForm } from "../action-form";
import { AssignForm } from "./assign-form";
import { CopyWeeksForm } from "./copy-weeks-form";
import { z } from "zod";
import { SessionWorkspace } from "./session-workspace";
import { CanonicalSessionEditor as SessionEditor } from "./canonical-session-editor";
import { DuplicateProgramForm } from "../duplicate-program-form";
import { CleanEditor, WeekWorkspace } from "./week-workspace";

export const metadata = { title: "Programa · Iron Strength" };

const shortDate = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const formatDay = (date: string) => shortDate.format(new Date(`${date}T00:00:00Z`));

export default async function ProgramEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ alumno?: string; semanas?: string; vista?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const coach = await requireCoach();
  const db = await createClient();
  const tree = await getCoachProgramTree(db, id);
  if (!tree)
    return (
      <div className="space-y-4">
        <Button variant="outline" render={<Link href="/coach/programs" />}>
          Volver a programas
        </Button>
        <h1 className="text-xl font-semibold">Programa no disponible</h1>
        <p className="text-sm text-muted-foreground">
          Se eliminó o ya no está disponible para tu cuenta.
        </p>
        <OrphanDraftRecovery userId={coach.id} programId={id} sessionIds={[]} />
      </div>
    );

  const query = await searchParams;
  const navigation = navigationContext(query);
  const candidate = z.uuid().safeParse(query.alumno);
  const target = candidate.success
    ? await db
        .from("profiles")
        .select("id,full_name,coach_id,role")
        .eq("id", candidate.data)
        .eq("is_active", true)
        .maybeSingle()
    : null;
  const selectedStudent =
    target?.data?.coach_id === tree.coachId &&
    (!tree.studentId || tree.studentId === target.data.id)
      ? target.data
      : null;
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
  const [pickerExercises, studentProfile, assignTargets] = await Promise.all([
    anyEditable ? listCoachCatalog(db) : Promise.resolve([]),
    tree.studentId
      ? db
          .from("profiles")
          .select("full_name,role")
          .eq("id", tree.studentId)
          .maybeSingle()
          .then((r) => r.data)
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

  const contextStudent =
    tree.studentId && studentProfile?.role === "student"
      ? tree.studentId
      : selectedStudent?.role === "student"
        ? selectedStudent.id
        : undefined;
  const weekNumbers = Array.from({ length: tree.weeksCount }, (_, i) => i + 1);

  return (
    <div className="coach-program-page flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <Button
          variant="ghost"
          className="w-fit -ml-3 text-muted-foreground"
          render={
            <Link
              href={selectedStudent ? adaptHref(navigation, selectedStudent.id) : "/coach/programs"}
            />
          }
        >
          <ArrowLeft aria-hidden /> Programas
        </Button>
        {contextStudent ? (
          <Button
            variant="outline"
            className="self-start"
            render={<Link href={studentHref(contextStudent, navigation)} />}
          >
            Volver a la ficha
          </Button>
        ) : null}
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {isTemplate ? "Plantilla" : `Programa de ${studentProfile?.full_name ?? "Alumno"}`}
        </p>
        <h1 className="text-xl font-semibold">{tree.name}</h1>
        {isTemplate && selectedStudent ? (
          <p className="text-sm font-medium text-primary">
            Preparando para {selectedStudent.full_name}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {range
            ? `Del ${formatDay(range.startDate)} al ${formatDay(range.endsOn)} · ${state === "active" ? `semana ${currentWeek} de ${tree.weeksCount}` : state === "scheduled" ? "programado" : "terminado"}`
            : `${tree.weeksCount} semanas · Diseña la rutina y luego asígnala a un alumno.`}
        </p>
      </header>
      <OrphanDraftRecovery
        userId={coach.id}
        programId={id}
        sessionIds={tree.sessions.map((session) => session.id)}
      />
      <WeekWorkspace
        key={tree.id}
        initialWeek={currentWeek ?? 1}
        scope={{ userId: tree.coachId, programId: tree.id }}
        weeks={weekNumbers.map((week) => ({
          number: week,
          sessionIds: tree.sessions.filter((s) => s.weekNumber === week).map((s) => s.id),
          editable: isWeekEditable(range, week, today),
          sessions: tree.sessions.filter((s) => s.weekNumber === week).length,
          exercises: tree.sessions
            .filter((s) => s.weekNumber === week)
            .reduce((n, s) => n + s.exercises.length, 0),
        }))}
        tools={
          <div className="space-y-3">
            <CleanEditor>
              <DuplicateProgramForm
                key={tree.id}
                userId={tree.coachId}
                programId={tree.id}
                name={tree.name}
                targetStudentId={selectedStudent?.id}
                navigation={navigation}
              />
            </CleanEditor>
            {tree.weeksCount > 1 ? (
              <CopyWeeksForm key={tree.id} tree={tree} userId={tree.coachId} today={today} />
            ) : null}
            {isTemplate ? (
              <AssignForm
                key={`${tree.id}:${selectedStudent?.id ?? "none"}`}
                userId={tree.coachId}
                tree={tree}
                targets={assignTargets}
                defaultStartDate={defaultStartDate(today)}
                today={today}
                selectedStudentId={selectedStudent?.id}
                navigation={navigation}
              />
            ) : null}
          </div>
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
              <SessionWorkspace
                sessions={sessions.map((s) => ({ id: s.id, label: s.label, title: s.title }))}
                weekNumber={week}
              >
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
                    <Card key={session.id} id={`session-${session.id}`}>
                      <CardHeader>
                        <CardTitle className="text-base" role="heading" aria-level={3}>
                          Sesión {session.label}
                          {session.title ? ` · ${session.title}` : ""}
                          {session.weekday != null ? ` · ${WEEKDAYS[session.weekday]}` : ""}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ol className="divide-y">
                          {session.exercises.map((exercise) => (
                            <li key={exercise.id} className="py-3 first:pt-0">
                              <p className="text-sm font-medium">{exercise.name}</p>
                              <TrainingPrescriptionSummary prescribed={exercise.prescribed} />
                              {exercise.supersetId ? (
                                <p className="mt-1 text-xs font-medium text-primary">
                                  Superserie{" "}
                                  {[
                                    ...new Set(
                                      session.exercises.map((e) => e.supersetId).filter(Boolean),
                                    ),
                                  ].indexOf(exercise.supersetId) + 1}{" "}
                                  · Descanso entre rondas:{" "}
                                  {exercise.supersetRestSeconds == null
                                    ? "predeterminado"
                                    : `${exercise.supersetRestSeconds} s`}
                                </p>
                              ) : exercise.restSeconds != null ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Descanso: {exercise.restSeconds} s
                                </p>
                              ) : null}
                              {(exercise.alternatives ?? []).length ? (
                                <ul className="mt-2 space-y-1 border-l-2 border-primary/30 pl-3">
                                  {exercise.alternatives!.map((alt) => (
                                    <li key={alt.id} className="text-sm">
                                      <span className="font-medium">Alternativa: {alt.name}</span>
                                      <TrainingPrescriptionSummary prescribed={alt.prescribed} />
                                      {alt.archived ? (
                                        <p className="text-xs text-muted-foreground">Archivado</p>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                              {exercise.note ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {exercise.note}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      </CardContent>
                    </Card>
                  ),
                )}
              </SessionWorkspace>
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
