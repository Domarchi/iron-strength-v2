import { expect, it } from "vitest";
import { assignedContextSchema, typedContextSchema, assignedCanStart } from "./training-context";
import { assignedTrainingFixture, assignedId as id } from "../../test/fixtures/assigned-training";
import { RECORD_TYPES } from "../../domain/training-metrics";
it.each([null, ...RECORD_TYPES])(
  "contexto asignado5 conserva %s, revisión y calendario reales",
  (kind) => {
    const fixture = assignedTrainingFixture(kind);
    expect(assignedContextSchema.parse(fixture)).toEqual(fixture);
    expect(typedContextSchema.parse(fixture)).toEqual(fixture);
  },
);
it("rechaza identidad incoherente, calendario imposible, grupos, duplicados y formatos futuros", () => {
  const c = assignedTrainingFixture();
  const bad = [
    { ...c, version: 6 },
    { ...c, future: true },
    { ...c, origin: { kind: "free" } },
    { ...c, sessionLabel: "B" },
    { ...c, title: "Otro" },
    { ...c, exercises: [c.exercises[0], c.exercises[0]] },
    {
      ...c,
      exercises: [
        {
          ...c.exercises[0],
          lastMetrics: {
            recordType: null,
            weightKg: 30,
            reps: 8,
            durationSeconds: null,
            distanceMeters: null,
          },
        },
      ],
    },
    ...[
      { id: id(90) },
      { programId: id(90) },
      { revision: -1 },
      { startDate: "2026-10-20" },
      { endsOn: "2026-11-16" },
      { weekNumber: 5 },
      { startDate: "2026-02-30" },
      { future: true },
    ].map((p) => ({ ...c, session: { ...c.session, ...p } })),
  ];
  for (const value of bad) expect(assignedContextSchema.safeParse(value).success).toBe(false);
});
it("semana vigente y cuenta se comprueban por fecha, sin impedir recuperar el contexto anterior", () => {
  const c = assignedContextSchema.parse(assignedTrainingFixture());
  for (const date of ["2026-10-26", "2026-11-01"])
    expect(assignedCanStart(c, id(1), date)).toBe(true);
  for (const date of ["2026-10-25", "2026-11-02", "2027-01-01"])
    expect(assignedCanStart(c, id(1), date)).toBe(false);
  expect(assignedCanStart(c, id(9), "2026-10-27")).toBe(false);
  expect(assignedCanStart(c, id(1), "not-a-date")).toBe(false);
});
it("el contexto3 anterior conserva forma exacta y no admite los metadatos nuevos", () => {
  const fixture = assignedTrainingFixture();
  const old = {
    origin: fixture.origin,
    title: fixture.title,
    sessionLabel: fixture.sessionLabel,
    exercises: fixture.exercises,
  };
  const previous = { ...old, version: 3 };
  expect(typedContextSchema.parse(previous)).toEqual(previous);
  expect(typedContextSchema.safeParse({ ...assignedTrainingFixture(), version: 3 }).success).toBe(
    false,
  );
});

it("un programa recortado conserva su calendario y bloquea solo inicios fuera de su vigencia", () => {
  const c = assignedContextSchema.parse({
    ...assignedTrainingFixture(),
    session: { ...assignedTrainingFixture().session, endsOn: "2026-10-29" },
  });
  expect(assignedCanStart(c, id(1), "2026-10-29")).toBe(true);
  expect(assignedCanStart(c, id(1), "2026-10-30")).toBe(false);
});

it("referencias de series conservan clase/métricas y rechazan ejercicios o tipos ajenos", () => {
  const c = assignedTrainingFixture();
  const reference = {
    exerciseId: c.exercises[0].exerciseId,
    recordType: "duration",
    sets: [
      {
        recordType: "duration",
        weightKg: null,
        reps: null,
        durationSeconds: 60,
        distanceMeters: null,
        setType: "warmup",
        effort: 4,
      },
    ],
  };
  expect(assignedContextSchema.parse({ ...c, previousSets: [reference] }).previousSets).toEqual([
    reference,
  ]);
  for (const references of [
    [reference, reference],
    [{ ...reference, exerciseId: id(99) }],
    [{ ...reference, recordType: "weight_reps" }],
    [{ ...reference, sets: [{ ...reference.sets[0], weightKg: 20 }] }],
  ])
    expect(assignedContextSchema.safeParse({ ...c, previousSets: references }).success).toBe(false);
});

it("conserva el contexto4 original sin referencias y no reinterpreta campos posteriores bajo4", () => {
  const c = assignedTrainingFixture();
  const old = {
    version: 4,
    userId: c.userId,
    origin: c.origin,
    title: c.title,
    sessionLabel: c.sessionLabel,
    session: c.session,
    exercises: c.exercises,
  };
  expect(typedContextSchema.parse(old)).toEqual(old);
  expect(typedContextSchema.safeParse({ ...old, previousSets: [] }).success).toBe(false);
});
