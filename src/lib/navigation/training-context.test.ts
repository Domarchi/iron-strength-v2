import { expect, it } from "vitest";
import {
  navigationContext,
  trainingParams,
  studentHref,
  progressHref,
  workoutHref,
  evidenceReturn,
} from "./training-context";
const student = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  exercise = "00000000-0000-4000-8000-000000000003",
  workout = "00000000-0000-4000-8000-000000000004";
it("conserva ocho semanas iniciales y solo admite periodo y métrica conocidos", () => {
  expect(navigationContext({})).toEqual({ weeks: 8, view: "1rm" });
  expect(navigationContext({ semanas: "12", vista: "volumen" })).toEqual({
    weeks: 12,
    view: "volumen",
  });
  expect(navigationContext({ semanas: ["4", "12"], vista: "https://evil.test" })).toEqual({
    weeks: 8,
    view: "1rm",
  });
  expect(trainingParams(navigationContext({}), student).toString()).toBe(`alumno=${student}`);
  expect(() => studentHref("../otro", navigationContext({}))).toThrow();
});
it("la evidencia conserva periodo/ejercicio y vuelve solo al alumno real del entrenamiento", () => {
  const context = navigationContext({ semanas: "12", vista: "volumen" });
  const url = new URL(workoutHref(workout, context, student, exercise), "https://iron.test");
  expect(url.searchParams.get("desde")).toBe("progreso");
  expect(
    evidenceReturn(
      context,
      student,
      false,
      { desde: "progreso", ejercicio: exercise, alumno: other },
      [exercise],
    ),
  ).toEqual({ href: progressHref(exercise, context, student), label: "Volver al progreso" });
  expect(
    evidenceReturn(
      context,
      student,
      false,
      { desde: "progreso", ejercicio: other, alumno: other, returnTo: "https://evil.test" },
      [exercise],
    ),
  ).toEqual({ href: studentHref(student, context), label: "Volver a la ficha" });
  expect(
    evidenceReturn(context, student, true, { desde: "progreso", ejercicio: other }, [exercise]),
  ).toEqual({ href: "/history", label: "Volver" });
});
