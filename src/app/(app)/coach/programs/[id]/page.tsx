import { ArrowDown, ArrowUp, Lock, Trash2 } from "lucide-react";
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
import {
  addExerciseAction,
  addSessionAction,
  deleteTemplateAction,
  moveExerciseAction,
  removeExerciseAction,
  removeSessionAction,
  updateExerciseAction,
} from "../actions";
import { ActionForm } from "../action-form";
import { AssignForm } from "./assign-form";
import { CopyWeekForm } from "./copy-week-form";
import { NEW_DEFAULTS, PrescriptionForm } from "./prescription-form";

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
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {isTemplate ? "Plantilla" : `Programa de ${studentName}`}
        </p>
        <h1 className="text-xl font-semibold">{tree.name}</h1>
        {range ? (
          <p className="text-sm text-muted-foreground">
            Del {formatDay(range.startDate)} al {formatDay(range.endsOn)} ·{" "}
            {state === "active"
              ? `semana ${currentWeek} de ${tree.weeksCount}`
              : state === "scheduled"
                ? "programado"
                : "terminado"}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{tree.weeksCount} semanas</p>
        )}
      </header>

      {isTemplate ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Asignar a un alumno</CardTitle>
          </CardHeader>
          <CardContent>
            <AssignForm
              templateId={tree.id}
              targets={assignTargets}
              defaultStartDate={defaultStartDate(today)}
            />
          </CardContent>
        </Card>
      ) : null}

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
          <section key={week} aria-labelledby={`week-${week}`} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={`week-${week}`} className="flex items-center gap-2 text-lg font-medium">
                Semana {week}
                {badge ? (
                  <span className="rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                    {badge}
                  </span>
                ) : null}
                {!editable ? (
                  <span
                    title="Bloqueada"
                    className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground"
                  >
                    <Lock className="size-3.5" aria-hidden /> Bloqueada
                  </span>
                ) : null}
              </h2>
              {editable ? (
                <CopyWeekForm
                  programId={tree.id}
                  toWeek={week}
                  otherWeeks={weekNumbers.filter((w) => w !== week)}
                  destinationHasSessions={sessions.length > 0}
                />
              ) : null}
            </div>

            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {editable
                  ? "Semana de descarga: sin sesiones. Agrega una si quieres entrenar."
                  : "Sin sesiones."}
              </p>
            ) : null}

            {sessions.map((session) => (
              <Card key={session.id}>
                <CardHeader className="flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base">Sesión {session.label}</CardTitle>
                  {editable ? (
                    <ActionForm
                      action={removeSessionAction}
                      fields={{ sessionId: session.id, programId: tree.id }}
                      label={<Trash2 aria-hidden />}
                      ariaLabel={`Quitar la sesión ${session.label} de la semana ${week}`}
                      confirm={`¿Quitar la sesión ${session.label} y sus ejercicios?`}
                      size="icon"
                      variant="ghost"
                    />
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {session.exercises.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin ejercicios todavía.</p>
                  ) : (
                    <ol className="flex flex-col divide-y">
                      {session.exercises.map((exercise, index) => (
                        <li key={exercise.id} className="flex flex-col gap-2 py-3 first:pt-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{exercise.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {formatPrescription(exercise)}
                              </p>
                              {exercise.note ? (
                                <p className="text-xs text-muted-foreground">{exercise.note}</p>
                              ) : null}
                              {exercise.archived ? (
                                <p className="text-xs text-destructive">Ejercicio archivado</p>
                              ) : null}
                            </div>
                            {editable ? (
                              <div className="flex shrink-0 items-center gap-1">
                                <ActionForm
                                  action={moveExerciseAction}
                                  fields={{
                                    id: exercise.id,
                                    sessionId: session.id,
                                    programId: tree.id,
                                    direction: "up",
                                  }}
                                  label={<ArrowUp aria-hidden />}
                                  ariaLabel={`Subir ${exercise.name}`}
                                  disabled={index === 0}
                                  size="icon"
                                  variant="ghost"
                                />
                                <ActionForm
                                  action={moveExerciseAction}
                                  fields={{
                                    id: exercise.id,
                                    sessionId: session.id,
                                    programId: tree.id,
                                    direction: "down",
                                  }}
                                  label={<ArrowDown aria-hidden />}
                                  ariaLabel={`Bajar ${exercise.name}`}
                                  disabled={index === session.exercises.length - 1}
                                  size="icon"
                                  variant="ghost"
                                />
                                <ActionForm
                                  action={removeExerciseAction}
                                  fields={{ id: exercise.id, programId: tree.id }}
                                  label={<Trash2 aria-hidden />}
                                  ariaLabel={`Quitar ${exercise.name}`}
                                  size="icon"
                                  variant="ghost"
                                />
                              </div>
                            ) : null}
                          </div>
                          {editable ? (
                            <details>
                              <summary className="min-h-11 cursor-pointer py-2 text-sm text-primary">
                                Editar prescripción
                              </summary>
                              <PrescriptionForm
                                action={updateExerciseAction}
                                hidden={{ id: exercise.id, programId: tree.id }}
                                defaults={{ ...exercise, exerciseId: exercise.exerciseId }}
                                submitLabel="Guardar prescripción"
                              />
                            </details>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  )}
                  {editable ? (
                    <details>
                      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-primary">
                        Agregar ejercicio
                      </summary>
                      <PrescriptionForm
                        action={addExerciseAction}
                        hidden={{ sessionId: session.id, programId: tree.id }}
                        exercises={pickerExercises}
                        defaults={NEW_DEFAULTS}
                        submitLabel="Agregar a la sesión"
                      />
                    </details>
                  ) : null}
                </CardContent>
              </Card>
            ))}

            {editable ? (
              <div>
                <ActionForm
                  action={addSessionAction}
                  fields={{ programId: tree.id, weekNumber: String(week) }}
                  label="Agregar sesión"
                  pendingLabel="Agregando…"
                  variant="secondary"
                />
              </div>
            ) : null}
          </section>
        );
      })}

      {isTemplate ? (
        <section className="border-t pt-4">
          <ActionForm
            action={deleteTemplateAction}
            fields={{ id: tree.id }}
            label="Eliminar plantilla"
            confirm="¿Eliminar esta plantilla? Los programas ya asignados no se tocan."
            variant="destructive"
          />
        </section>
      ) : null}
    </div>
  );
}
