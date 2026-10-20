import { expect, it } from "vitest";
import { coachSignals } from "./coach-signals";
import type { StudentOverview } from "@/lib/data/students";
const student: StudentOverview = {
  id: "a",
  fullName: "Ana",
  isActive: true,
  lastWorkoutDate: "2026-10-12",
  lastWorkoutId: "last",
  lastCommentAt: null,
  week: {
    kind: "active",
    programId: "program",
    programName: "Fuerza",
    startDate: "2026-10-05",
    endsOn: "2026-10-25",
    weekNumber: 3,
    planned: 3,
    done: 0,
    deload: false,
  },
};
it("señala fin e inactividad exacta de siete días con evidencia", () => {
  expect(coachSignals(student, "2026-10-19", [])).toEqual([
    expect.objectContaining({ kind: "ending", href: "/coach/programs/program" }),
    expect.objectContaining({ kind: "inactive", href: "/history/last" }),
  ]);
  expect(coachSignals(student, "2026-10-18", []).some((s) => s.kind === "inactive")).toBe(false);
});
it("no señala inactividad en descarga, sin sesiones, recién iniciado o desactivado", () => {
  if (student.week.kind !== "active") throw Error("fixture");
  for (const variant of [
    { ...student, week: { ...student.week, deload: true } },
    { ...student, week: { ...student.week, planned: 0 } },
    { ...student, week: { ...student.week, startDate: "2026-10-19" } },
    { ...student, isActive: false },
  ])
    expect(coachSignals(variant, "2026-10-20", []).some((s) => s.kind === "inactive")).toBe(false);
});
it("sin programa incluye terminados pero no programados; sin historia cuenta desde el inicio", () => {
  expect(
    coachSignals(
      { ...student, week: { kind: "finished", programName: "Viejo" } },
      "2026-10-20",
      [],
    ),
  ).toEqual([expect.objectContaining({ kind: "no_program" })]);
  expect(
    coachSignals(
      { ...student, week: { kind: "scheduled", programName: "Próximo" } },
      "2026-10-20",
      [],
    ),
  ).toEqual([]);
  expect(
    coachSignals({ ...student, lastWorkoutDate: null, lastWorkoutId: null }, "2026-10-20", []),
  ).toContainEqual(expect.objectContaining({ kind: "inactive", href: "/coach/students/a" }));
});
it("comentarios filtra por alumno y enlaza el entrenamiento pendiente más reciente", () => {
  const unread = [
    { studentId: "b", workoutId: "other", count: 9, lastCommentAt: "2026-10-21T10:00:00Z" },
    { studentId: "a", workoutId: "old", count: 2, lastCommentAt: "2026-10-19T10:00:00Z" },
    { studentId: "a", workoutId: "new", count: 1, lastCommentAt: "2026-10-20T10:00:00Z" },
  ];
  expect(coachSignals(student, "2026-10-20", unread)[0]).toMatchObject({
    kind: "comments",
    href: "/history/new",
    label: "3 comentarios pendientes",
  });
  expect(coachSignals({ ...student, isActive: false }, "2026-10-20", unread)).toEqual([]);
});
