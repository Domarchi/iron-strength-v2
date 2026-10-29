import { trainingDownloadFixture as fixture } from "../../test/fixtures/training-download";
import { expect, it } from "vitest";
import { assignedId as id } from "../../test/fixtures/assigned-training";
import { bundleSchema, downloadedAssignedContext } from "./training-bundle";
import { RECORD_TYPES, trainingTargetSummary } from "../../domain/training-metrics";
import { defaultPrescriptionInput, parsePrescriptionInput } from "../../domain/prescription-input";

it("conserva objetivos completos y semana/biblioteca/catálogo en el mismo documento propio", () => {
  const b = bundleSchema.parse(fixture());
  expect(b.library.routines[0].items[0].prescribed.target.targetDurationSeconds).toBe(60);
  expect(downloadedAssignedContext(b, id(1), id(3), "2026-10-29")).toEqual(
    b.week!.sessions[0].context,
  );
  expect(downloadedAssignedContext(b, id(2), id(3), "2026-10-29")).toBeNull();
  expect(downloadedAssignedContext(b, id(1), id(3), "2026-11-02")).toBeNull();
  expect(b.library.routines).toHaveLength(1); // a later week does not erase personal bases
});
it("sin programa mantiene catálogo y bases personales descargadas", () => {
  const b = bundleSchema.parse({ ...fixture(), week: null });
  expect(b.library.routines).toHaveLength(1);
  expect(downloadedAssignedContext(b, id(1), id(3), "2026-10-29")).toBeNull();
});
it("archivado referenciado conserva metadata e historial sin reaparecer en el catálogo activo", () => {
  const s = fixture();
  s.catalog.exercises = [];
  expect(bundleSchema.parse(s).library.routines[0].items[0].exerciseId).toBe(id(5));
});
it("rechaza identidad/versión/campos inesperados y fuentes parciales", () => {
  const s = fixture();
  for (const value of [
    { ...s, version: 2 },
    { ...s, accessToken: "must-not-persist" },
    { ...s, library: { ...s.library, userId: id(20) } },
    { ...s, history: {} },
    { ...s, history: { ...s.history, [id(20)]: s.history[id(5)] } },
    {
      ...s,
      history: {
        [id(5)]: { ...s.history[id(5)], exercise: { ...s.history[id(5)].exercise, name: "Otro" } },
      },
    },
    { ...s, week: { ...s.week, sessionCount: 2 } },
    { ...s, week: { ...s.week, sessions: [...s.week.sessions, ...s.week.sessions] } },
    {
      ...s,
      week: {
        ...s.week,
        sessions: [
          { ...s.week.sessions[0], context: { ...s.week.sessions[0].context, userId: id(20) } },
        ],
      },
    },
    { ...s, week: { ...s.week, weekStart: "2026-10-19" } },
    { ...s, week: { ...s.week, program: { ...s.week.program, name: "Otro" } } },
    { ...s, downloadedAt: "2026-11-02T12:00:00Z" },
  ])
    expect(bundleSchema.safeParse(value).success).toBe(false);
});
it("vacío explícito no equivale a una descarga personal omitida", () => {
  const s = fixture();
  const b = bundleSchema.parse({
    ...s,
    week: null,
    catalog: { version: 2, exercises: [] },
    library: { version: 2, userId: id(1), folders: [], routines: [] },
    history: {},
  });
  expect(b.library.routines).toEqual([]);
});

for (const kind of [null, ...RECORD_TYPES])
  it(`conserva ${kind ?? "legado null"} sin transformar objetivos al descargar`, () => {
    const b = bundleSchema.parse(fixture(kind));
    expect(b.library.routines[0].items[0].prescribed.recordType).toBe(kind);
    expect(b.week!.sessions[0].context.exercises[0].prescribed.recordType).toBe(kind);
    expect(b.history[id(5)].exercise.recordType).toBe(kind);
  });
it("detalle por serie mantiene sus diferencias; la biblioteca no se uniforma al descargar", () => {
  const s = fixture();
  const a = s.library.routines[0].items[0];
  const series = [
    { ...a.prescribed.target, targetDurationSeconds: 60 },
    { ...a.prescribed.target, targetDurationSeconds: 90 },
  ];
  a.prescribed = { recordType: "duration", sets: 2, target: trainingTargetSummary(series), series };
  const b = bundleSchema.parse(s);
  expect(
    b.library.routines[0].items[0].prescribed.series?.map((t) => t.targetDurationSeconds),
  ).toEqual([60, 90]);
});
it("prescripción asignada antigua null no se infiere desde metadata de tipo nuevo", () => {
  const s = fixture("weight_reps");
  s.week.sessions[0].context.exercises[0].prescribed = parsePrescriptionInput(
    defaultPrescriptionInput(null),
  );
  const b = bundleSchema.parse(s);
  expect(b.week!.sessions[0].context.exercises[0].prescribed.recordType).toBeNull();
  expect(b.history[id(5)].exercise.recordType).toBe("weight_reps");
});
it("el corte de descarga usa Santiago, también en el borde UTC del lunes", () => {
  expect(
    bundleSchema.safeParse({ ...fixture(), downloadedAt: "2026-10-26T02:59:00Z" }).success,
  ).toBe(false);
  expect(
    bundleSchema.safeParse({ ...fixture(), downloadedAt: "2026-10-26T03:00:00Z" }).success,
  ).toBe(true);
});
