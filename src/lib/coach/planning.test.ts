import { expect, it } from "vitest";
import {
  assignmentWindow,
  assignmentImpacts,
  makeCopyInput,
  copyWeeksInputSchema,
} from "./planning";
import type { ProgramTree } from "@/lib/data/programs";
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
