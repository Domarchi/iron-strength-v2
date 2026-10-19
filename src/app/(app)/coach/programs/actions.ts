"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCoach } from "@/lib/auth/session";
import {
  addSession,
  assignProgram,
  copyWeek,
  createTemplate,
  deleteTemplate,
  getProgramTree,
  removeSession,
  removeSessionExercise,
  reorderSessionExercises,
  type AssignFailure,
  type Failure,
} from "@/lib/data/programs";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null; done?: boolean };

const FAILURES: Record<Failure | "destination_not_empty" | AssignFailure, string> = {
  not_found: "No se encontró lo que intentas modificar. Recarga la página.",
  invalid: "Revisa los datos ingresados.",
  limit: "Alcanzaste el límite: 7 sesiones por semana y 15 ejercicios por sesión.",
  week_locked: "Esa semana ya terminó: no se puede modificar. Solo la actual y las futuras.",
  forbidden: "No tienes permiso para hacer esto.",
  destination_not_empty:
    "La semana destino ya tiene sesiones. Marca “Reemplazar” para sobrescribirla.",
  past_date: "La fecha de inicio no puede ser anterior al lunes de esta semana.",
  inactive_student: "Ese alumno está desactivado.",
  has_workouts: "Ese alumno ya tiene entrenamientos en un programa que empezaría en esa fecha.",
};

const failed = (reason: keyof typeof FAILURES): ActionState => ({ error: FAILURES[reason] });
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");
const num = (fd: FormData, key: string) => Number(fd.get(key));

function refresh(programId?: string) {
  revalidatePath("/coach/programs");
  if (programId) revalidatePath(`/coach/programs/${programId}`);
}

export async function createTemplateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const coach = await requireCoach();
  const result = await createTemplate({
    db: await createClient(),
    coachId: coach.id,
    input: { name: text(fd, "name"), weeksCount: text(fd, "weeksCount") },
  });
  if (!result.ok) return failed(result.reason);
  refresh();
  redirect(`/coach/programs/${result.id}`);
}

export async function deleteTemplateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireCoach();
  const result = await deleteTemplate({ db: await createClient(), id: text(fd, "id") });
  if (!result.ok) return failed(result.reason);
  refresh();
  redirect("/coach/programs");
}

export async function addSessionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireCoach();
  const programId = text(fd, "programId");
  const result = await addSession({
    db: await createClient(),
    programId,
    weekNumber: num(fd, "weekNumber"),
  });
  if (!result.ok) return failed(result.reason);
  refresh(programId);
  return { error: null, done: true };
}

export async function removeSessionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireCoach();
  const result = await removeSession({
    db: await createClient(),
    sessionId: text(fd, "sessionId"),
  });
  if (!result.ok) return failed(result.reason);
  refresh(text(fd, "programId"));
  return { error: null, done: true };
}

export async function removeExerciseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireCoach();
  const result = await removeSessionExercise({ db: await createClient(), id: text(fd, "id") });
  if (!result.ok) return failed(result.reason);
  refresh(text(fd, "programId"));
  return { error: null, done: true };
}

// Sube o baja un ejercicio una posición dentro de su sesión.
export async function moveExerciseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireCoach();
  const db = await createClient();
  const programId = text(fd, "programId");
  const sessionId = text(fd, "sessionId");
  const id = text(fd, "id");
  const direction = text(fd, "direction") === "up" ? -1 : 1;

  const tree = await getProgramTree(db, programId);
  const session = tree?.sessions.find((s) => s.id === sessionId);
  if (!session) return failed("not_found");

  const ids = session.exercises.map((e) => e.id);
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from === -1) return failed("not_found");
  if (to < 0 || to >= ids.length) return { error: null, done: true };
  [ids[from], ids[to]] = [ids[to], ids[from]];

  const result = await reorderSessionExercises({ db, sessionId, orderedIds: ids });
  if (!result.ok) return failed(result.reason);
  refresh(programId);
  return { error: null, done: true };
}

export async function copyWeekAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireCoach();
  const programId = text(fd, "programId");
  const result = await copyWeek({
    db: await createClient(),
    programId,
    fromWeek: num(fd, "fromWeek"),
    toWeek: num(fd, "toWeek"),
    replace: fd.get("replace") === "on",
  });
  if (!result.ok) return failed(result.reason);
  refresh(programId);
  return { error: null, done: true };
}

export async function assignProgramAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireCoach();
  const result = await assignProgram({
    db: await createClient(),
    templateId: text(fd, "templateId"),
    studentId: text(fd, "studentId"),
    startDate: text(fd, "startDate"),
  });
  if (!result.ok) return failed(result.reason);
  refresh();
  redirect(`/coach/programs/${result.programId}`);
}
