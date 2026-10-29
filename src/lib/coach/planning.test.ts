import { expect, it } from "vitest";
import {
  assignmentWindow,
  assignmentImpacts,
  makeCopyInput,
  copyWeeksInputSchema,
  programSnapshot,
  weekPlanningSummary,
} from "./planning";
import type { ProgramTree } from "@/lib/data/programs";
import { defaultPrescriptionInput, parsePrescriptionInput } from "@/domain/prescription-input";
const ids = [crypto.randomUUID(), crypto.randomUUID()];
const tree = {
  id: crypto.randomUUID(),
  name: "Base",
  weeksCount: 4,
  coachId: crypto.randomUUID(),
  studentId: null,
  startDate: null,
  endsOn: null,
  sessions: ids.map((id, index) => ({
    id,
    revision: index + 2,
    weekNumber: index + 1,
    label: "A",
    position: 0,
    exercises: [],
  })),
} satisfies ProgramTree;
it("las revisiones y conteos no necesitan proyectar objetivos modernos a repeticiones", () => {
  const canonical = {
    ...tree,
    sessions: tree.sessions.map((session) => ({
      ...session,
      title: "Tiempo y distancia",
      exercises: [
        { prescribed: parsePrescriptionInput(defaultPrescriptionInput("duration")) },
        {
          prescribed: {
            ...parsePrescriptionInput(defaultPrescriptionInput("weight_distance")),
            sets: 2,
          },
        },
      ],
    })),
  };
  expect(programSnapshot(canonical)).toEqual(programSnapshot(tree));
  expect(makeCopyInput(canonical, 1, [{ week: 2, replace: true }])).toEqual(
    makeCopyInput(tree, 1, [{ week: 2, replace: true }]),
  );
  expect(weekPlanningSummary(canonical, 1)).toEqual({
    sessions: 1,
    exercises: 2,
    sets: 5,
    titles: ["A · Tiempo y distancia"],
  });
  expect(weekPlanningSummary(tree, 1).sets).toBe(0);
});
it("el lote congela la pertenencia completa incluso cuando un destino está vacío", () => {
  const input = makeCopyInput(tree, 1, [
    { week: 2, replace: true },
    { week: 3, replace: false },
  ]);
  expect(input.sourceSessions).toEqual([{ id: ids[0], revision: 2 }]);
  expect(input.targets).toEqual([
    { week: 2, replace: true, sessions: [{ id: ids[1], revision: 3 }] },
    { week: 3, replace: false, sessions: [] },
  ]);
  expect(copyWeeksInputSchema.safeParse(input).success).toBe(true);
  expect(
    copyWeeksInputSchema.safeParse({ ...input, targets: [input.targets[0], input.targets[0]] })
      .success,
  ).toBe(false);
  expect(
    copyWeeksInputSchema.safeParse({ ...input, targets: [{ ...input.targets[0], week: 1 }] })
      .success,
  ).toBe(false);
});
it("la revisión usa el lunes efectivo y distingue recorte de reemplazo con entrenamientos", () => {
  const range = assignmentWindow("2026-10-21", 4, "2026-10-21");
  expect(range).toEqual({ startDate: "2026-10-19", endsOn: "2026-11-15" });
  expect(assignmentWindow("2026-10-11", 4, "2026-10-21")).toBeNull();
  const base = {
    id: crypto.randomUUID(),
    name: "Anterior",
    startDate: "2026-10-12",
    endsOn: "2026-11-01",
    workouts: 2,
  };
  const impacts = assignmentImpacts(
    [
      base,
      { ...base, id: crypto.randomUUID(), startDate: "2026-10-26" },
      { ...base, id: crypto.randomUUID(), endsOn: "2026-10-18" },
    ],
    range!,
  );
  expect(impacts).toMatchObject([
    { kind: "shorten", endsOn: "2026-10-18", blocked: false },
    { kind: "replace", blocked: true },
  ]);
});
