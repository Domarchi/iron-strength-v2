import { expect, it } from "vitest";
import { assignedId as id, assignedTrainingFixture } from "@/test/fixtures/assigned-training";
import { createTypedDraft } from "../../../mobile/src/lib/typed-training";
import { localAssignedTrainings } from "./local-typed-training";
it("descubre el activo asignado propio sin escribir, incluyendo una sesión fuera de la lista actual", () => {
  const context = assignedTrainingFixture(),
    draft = createTypedDraft({
      context,
      userId: id(1),
      workoutId: id(90),
      now: new Date("2026-10-29T15:00:00Z"),
    }),
    raw = JSON.stringify({
      version: 4,
      userId: id(1),
      active: { mode: "real", routine: context, draft, activeIndex: 0 },
      demos: [],
    });
  const storage = {
    getItem: (key: string) => (key === `is:native-training:v1:${id(1)}` ? raw : null),
  };
  expect(localAssignedTrainings(storage, id(1))).toEqual([
    { sessionId: id(3), workoutId: id(90), phase: "in_progress" },
  ]);
  expect(localAssignedTrainings(storage, id(2))).toEqual([]);
});
it("no interpreta formatos futuros ni un sobre ajeno bajo una clave propia", () => {
  for (const raw of [
    '{"version":99}',
    JSON.stringify({ version: 4, userId: id(2), active: null, demos: [] }),
  ])
    expect(localAssignedTrainings({ getItem: () => raw }, id(1))).toEqual([]);
});
